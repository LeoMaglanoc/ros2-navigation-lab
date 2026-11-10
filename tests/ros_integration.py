"""Run inside the ROS Docker image: exercises real DDS topics/actions, not mocks."""
import math
import subprocess
import tempfile
import time
import rclpy
from rclpy.action import ActionClient
from rclpy.node import Node
from rclpy.qos import QoSProfile, DurabilityPolicy
from action_msgs.msg import GoalStatus
from geometry_msgs.msg import Twist
from nav_msgs.msg import OccupancyGrid, Odometry, Path
from tf2_msgs.msg import TFMessage
from navigation_interfaces.action import Navigate2D


def main():
    rclpy.init()
    node = Node('navigation_acceptance_test')
    messages = {'odom': [], 'velocity': [], 'map': [], 'path': [], 'tf': []}
    transient = QoSProfile(depth=1, durability=DurabilityPolicy.TRANSIENT_LOCAL)
    subscriptions = [
        node.create_subscription(Odometry, 'odom', messages['odom'].append, 10),
        node.create_subscription(Twist, 'cmd_vel', messages['velocity'].append, 10),
        node.create_subscription(OccupancyGrid, 'map', messages['map'].append, transient),
        node.create_subscription(Path, 'plan', messages['path'].append, transient),
        node.create_subscription(TFMessage, 'tf', messages['tf'].append, 10),
    ]
    client = ActionClient(node, Navigate2D, 'navigate_2d')
    logs = tempfile.TemporaryFile(mode='w+')
    server = subprocess.Popen(['ros2', 'run', 'navigation_lab', 'navigation_server'], stdout=logs, stderr=logs)
    def until(predicate, timeout=10):
        deadline = time.monotonic()+timeout
        while not predicate() and time.monotonic()<deadline:
            rclpy.spin_once(node, timeout_sec=.02)
        assert predicate(), 'Timed out waiting for ROS evidence'
    def wait(future, timeout=10):
        until(future.done, timeout)
        return future.result()
    def goal(x,y):
        return wait(client.send_goal_async(Navigate2D.Goal(x=x,y=y)))
    try:
        assert client.wait_for_server(timeout_sec=20), 'Action server did not start'
        until(lambda: all(messages.values()))
        grid=messages['map'][-1]
        assert len(grid.data)==600 and grid.header.frame_id=='map'
        assert abs(grid.info.resolution-.4)<1e-6 and set(grid.data)=={0,100}
        assert not goal(-1.,2.).accepted
        assert not goal(.2,.2).accepted
        first=goal(7.,2.6); assert first.accepted
        first_result=first.get_result_async()
        until(lambda: any(m.twist.twist.linear.x>0 for m in messages['odom']))
        second=goal(2.6,3.); assert second.accepted
        second_result=second.get_result_async()
        old=wait(first_result)
        assert old.status==GoalStatus.STATUS_ABORTED and 'Superseded' in old.result.message
        unreachable=goal(10.6,6.2); assert unreachable.accepted
        failed=wait(unreachable.get_result_async())
        assert failed.status==GoalStatus.STATUS_ABORTED and not failed.result.success
        assert not second_result.done(), 'Unreachable request must not terminate the active goal'
        cancel=wait(second.cancel_goal_async()); assert cancel.goals_canceling
        canceled=wait(second_result);assert canceled.status==GoalStatus.STATUS_CANCELED
        count=len(messages['velocity'])
        until(lambda:len(messages['velocity'])>=count+5)
        assert messages['velocity'][-1].linear.x==0 and messages['velocity'][-1].angular.z==0
        pose=messages['odom'][-1].pose.pose.position
        gx=(math.floor(pose.x/.4)+.5)*.4;gy=(math.floor(pose.y/.4)+.5)*.4
        final=goal(gx,gy)
        done=wait(final.get_result_async(),10)
        assert done.status==GoalStatus.STATUS_SUCCEEDED and done.result.success
        until(lambda:abs(messages['odom'][-1].pose.pose.position.x-gx)<1e-8
              and abs(messages['odom'][-1].pose.pose.position.y-gy)<1e-8)
        assert all(m.header.frame_id=='map' and m.child_frame_id=='base_link' for m in messages['odom'])
        assert max(abs(m.linear.x) for m in messages['velocity'])<=.9000001
        assert max(abs(m.angular.z) for m in messages['velocity'])<=3.0000001
        tf=messages['tf'][-1].transforms[0]
        assert tf.header.frame_id=='map' and tf.child_frame_id=='base_link'
        assert any(len(m.poses)>1 for m in messages['path'])
        print('PASS: real ROS 2 map/path/odom/cmd_vel/tf; rejected, superseded, unreachable, canceled and successful actions.')
    finally:
        server.terminate()
        try:server.wait(timeout=10)
        except subprocess.TimeoutExpired:server.kill();server.wait()
        logs.seek(0);print(logs.read());logs.close()
        client.destroy();node.destroy_node();rclpy.shutdown()
        del subscriptions

if __name__=='__main__':main()
