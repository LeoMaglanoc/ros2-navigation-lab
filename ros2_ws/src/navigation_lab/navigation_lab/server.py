"""One ROS node owns the engine; cooperative action futures never block its timer."""
import math
import rclpy
from rclpy.action import ActionServer, CancelResponse, GoalResponse
from rclpy.callback_groups import ReentrantCallbackGroup
from rclpy.executors import SingleThreadedExecutor
from rclpy.node import Node
from rclpy.qos import QoSProfile, DurabilityPolicy, ReliabilityPolicy
from rclpy.task import Future
from geometry_msgs.msg import PoseStamped, TransformStamped, Twist
from nav_msgs.msg import OccupancyGrid, Odometry, Path
from tf2_ros import TransformBroadcaster
from navigation_interfaces.action import Navigate2D
from navigation_lab.core import Core


def pose_message(x, y, yaw, stamp):
    p = PoseStamped()
    p.header.stamp = stamp
    p.header.frame_id = 'map'
    p.pose.position.x, p.pose.position.y = float(x), float(y)
    p.pose.orientation.z, p.pose.orientation.w = math.sin(yaw/2), math.cos(yaw/2)
    return p


class NavigationServer(Node):
    def __init__(self):
        super().__init__('navigation_server')
        self.core = Core()
        self.active = None
        self.contexts = {}
        latched = QoSProfile(depth=1, durability=DurabilityPolicy.TRANSIENT_LOCAL,
                             reliability=ReliabilityPolicy.RELIABLE)
        self.map_pub = self.create_publisher(OccupancyGrid, 'map', latched)
        self.path_pub = self.create_publisher(Path, 'plan', latched)
        self.odom_pub = self.create_publisher(Odometry, 'odom', 10)
        self.velocity_pub = self.create_publisher(Twist, 'cmd_vel', 10)
        self.tf = TransformBroadcaster(self)
        self.action = ActionServer(
            self, Navigate2D, 'navigate_2d', execute_callback=self.execute,
            goal_callback=self.validate, cancel_callback=lambda _: CancelResponse.ACCEPT,
            handle_accepted_callback=self.accepted, callback_group=ReentrantCallbackGroup())
        self.publish_map()
        self.publish_path(self.core.snapshot())
        self.timer = self.create_timer(0.02, self.tick)
        self.get_logger().info('Rust navigation core ready. Action: /navigate_2d')

    def validate(self, request):
        s = self.core.snapshot()
        x, y = request.x, request.y
        if not (math.isfinite(x) and math.isfinite(y) and 0 <= x < 12 and 0 <= y < 8):
            return GoalResponse.REJECT
        if s['map']['blocked'][int(y/.4)*30+int(x/.4)]:
            return GoalResponse.REJECT
        return GoalResponse.ACCEPT

    def finish(self, context, outcome, message):
        handle, future = context
        if outcome == 'succeeded':
            handle.succeed()
        elif outcome == 'canceled':
            handle.canceled()
        else:
            handle.abort()
        future.set_result(Navigate2D.Result(success=outcome == 'succeeded', message=message))

    def accepted(self, handle):
        # Acceptance order determines ownership. No await occurs in this transaction.
        key = bytes(handle.goal_id.uuid)
        future = Future()
        self.contexts[key] = (handle, future)
        handle.execute()  # Transition to EXECUTING before possible terminal transitions.
        code = self.core.goal(handle.request.x, handle.request.y)
        if code:
            self.finish((handle, future), 'aborted', 'No route; previous goal unchanged')
            return
        if self.active is not None:
            self.finish(self.contexts[self.active], 'aborted', 'Superseded by a newer valid goal')
        self.active = key
        self.publish_path(self.core.snapshot())

    async def execute(self, handle):
        key = bytes(handle.goal_id.uuid)
        result = await self.contexts[key][1]
        del self.contexts[key]
        return result

    def tick(self):
        if self.active is not None:
            context = self.contexts[self.active]
            if context[0].is_cancel_requested:
                self.core.cancel()
                self.finish(context, 'canceled', 'Canceled; robot stopped')
                self.active = None
                self.publish_path(self.core.snapshot())
        self.core.tick()
        s = self.core.snapshot()
        stamp = self.get_clock().now().to_msg()
        x, y, yaw = s['pose']
        p = pose_message(x, y, yaw, stamp)
        twist = Twist()
        twist.linear.x, twist.angular.z = s['velocity']
        self.velocity_pub.publish(twist)
        odom = Odometry()
        odom.header = p.header
        odom.child_frame_id = 'base_link'
        odom.pose.pose = p.pose
        odom.twist.twist = twist
        self.odom_pub.publish(odom)
        tf = TransformStamped()
        tf.header = p.header
        tf.child_frame_id = 'base_link'
        tf.transform.translation.x, tf.transform.translation.y = x, y
        tf.transform.rotation = p.pose.orientation
        self.tf.sendTransform(tf)
        if self.active is not None:
            context = self.contexts[self.active]
            if s['state'] == 'arrived':
                self.finish(context, 'succeeded', 'Destination reached')
                self.active = None
            elif s['ticks'] % 5 == 0:
                points = [[x, y]] + s['path'][s['waypoint']:]
                remaining = sum(math.dist(a, b) for a, b in zip(points, points[1:]))
                context[0].publish_feedback(Navigate2D.Feedback(
                    x=x, y=y, distance_remaining=remaining))

    def publish_path(self, s):
        path = Path()
        path.header.frame_id = 'map'
        path.header.stamp = self.get_clock().now().to_msg()
        path.poses = [pose_message(x, y, 0, path.header.stamp) for x, y in s['path']]
        self.path_pub.publish(path)

    def publish_map(self):
        s = self.core.snapshot()
        msg = OccupancyGrid()
        msg.header.frame_id = 'map'
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.info.width, msg.info.height = 30, 20
        msg.info.resolution = 0.4
        msg.info.origin.orientation.w = 1.0
        msg.data = [100 if occupied else 0 for occupied in s['map']['occupied']]
        self.map_pub.publish(msg)


def main(args=None):
    rclpy.init(args=args)
    node = NavigationServer()
    executor = SingleThreadedExecutor()
    executor.add_node(node)
    try:
        executor.spin()
    except KeyboardInterrupt:
        pass
    finally:
        executor.shutdown()
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()
