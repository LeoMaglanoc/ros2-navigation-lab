// Real ROS 2 nodes run in this module. Navigation stays in the separate Rust WASM.
// No direct UI -> Rust goal path exists: requests are published, taken, then handled.
#include <rcl/rcl.h>
#include <rcl/error_handling.h>
#include <rmw/rmw.h>
#include <rosidl_typesupport_introspection_cpp/message_type_support_decl.hpp>
#include <geometry_msgs/msg/pose2_d.hpp>
#include <geometry_msgs/msg/twist.hpp>
#include <nav_msgs/msg/occupancy_grid.hpp>
#include <nav_msgs/msg/odometry.hpp>
#include <nav_msgs/msg/path.hpp>
#include <std_msgs/msg/string.hpp>
#include <std_msgs/msg/u_int8.hpp>
#include <emscripten.h>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <sstream>
#include <string>

// EM_JS bodies are JavaScript; C++ formatters otherwise corrupt strict equality.
// clang-format off
// These host imports bridge to the real Rust module, not to a JS planner.
EM_JS(int, engine_goal, (double x, double y), { return Module.navEngine.goal(x, y); });
EM_JS(void, engine_tick, (), { Module.navEngine.tick(); });
EM_JS(void, engine_control, (int command), { Module.navEngine.control(command); });
EM_JS(int, engine_json_size, (), { return Module.navEngine.json.length; });
EM_JS(void, engine_json_copy, (char *destination), {
  // The core snapshot schema contains only ASCII keys/enums and numeric/bool values.
  const text = Module.navEngine.json;
  for (let i = 0; i < text.length; i++)
    HEAPU8[destination + i] = text.charCodeAt(i);
  HEAPU8[destination + text.length] = 0;
});
EM_JS(double, engine_value, (int field, int index), {
  const s = Module.navEngine.state;
  if (field < 3)
    return s.pose[field];
  if (field === 3)
    return s.velocity[0];
  if (field === 4)
    return s.velocity[1];
  if (field === 5)
    return s.ticks;
  if (field === 6)
    return s.path.length;
  if (field === 20 || field === 21)
    return s.path[index][field - 20];
  if (field === 30)
    return s.map.occupied[index] ? 100 : 0;
  return 0;
});

// clang-format on

namespace {
rcl_context_t context = rcl_get_zero_initialized_context();
rcl_node_t ui = rcl_get_zero_initialized_node();
rcl_node_t navigator = rcl_get_zero_initialized_node();
bool goal_subscription = true;
int goal_result = 0;
std::string received_snapshot = "{}";
std::string diagnostics;

void check(rcl_ret_t rc) {
  if (rc != RCL_RET_OK) {
    std::fprintf(stderr, "ROS 2 error %d: %s\n", rc, rcl_get_error_string().str);
    std::abort();
  }
}

template <class Message> struct Topic {
  rcl_publisher_t publisher = rcl_get_zero_initialized_publisher();
  rcl_subscription_t subscriber = rcl_get_zero_initialized_subscription();
  Message message{};
  const char *type_name = nullptr;
  const char *name = nullptr;
  unsigned long published = 0, received = 0;
  void subscribe(rcl_node_t *node) {
    auto options = rcl_subscription_get_default_options();
    // Direct introspection support is linked statically: no dlopen in the browser.
    const auto *type =
        rosidl_typesupport_introspection_cpp::get_message_type_support_handle<Message>();
    check(rcl_subscription_init(&subscriber, node, type, name, &options));
  }
  void init(rcl_node_t *from, rcl_node_t *to, const char *topic, const char *type_label) {
    name = topic;
    type_name = type_label;
    auto options = rcl_publisher_get_default_options();
    const auto *type =
        rosidl_typesupport_introspection_cpp::get_message_type_support_handle<Message>();
    check(rcl_publisher_init(&publisher, from, type, topic, &options));
    subscribe(to);
  }
  void publish(const Message &value) {
    check(rcl_publish(&publisher, &value, nullptr));
    ++published;
  }
  bool take() {
    rmw_message_info_t info{};
    const auto rc = rcl_take(&subscriber, &message, &info, nullptr);
    if (rc == RCL_RET_SUBSCRIPTION_TAKE_FAILED) {
      rcl_reset_error();
      return false;
    }
    check(rc);
    ++received;
    return true;
  }
  void describe(std::ostream &out) const {
    out << "{\"name\":\"" << rcl_publisher_get_topic_name(&publisher) << "\",\"type\":\""
        << type_name << "\",\"published\":" << published << ",\"received\":" << received << "}";
  }
};
Topic<geometry_msgs::msg::Pose2D> goals;
Topic<std_msgs::msg::UInt8> controls;
Topic<std_msgs::msg::String> state;
Topic<nav_msgs::msg::OccupancyGrid> map;
Topic<nav_msgs::msg::Path> plan;
Topic<nav_msgs::msg::Odometry> odometry;
Topic<geometry_msgs::msg::Twist> velocity;

std_msgs::msg::Header header() {
  std_msgs::msg::Header h;
  h.frame_id = "map";
  const auto ticks = static_cast<unsigned long>(engine_value(5, 0));
  h.stamp.sec = static_cast<int>(ticks / 50);
  h.stamp.nanosec = static_cast<unsigned>((ticks % 50) * 20000000);
  return h;
}
void observe() {
  // The canvas consumes ONLY the snapshot received by browser_ui's ROS subscription.
  while (state.take())
    received_snapshot = state.message.data;
  while (map.take()) {
  }
  while (plan.take()) {
  }
  while (odometry.take()) {
  }
  while (velocity.take()) {
  }
}
void publish_state() {
  std_msgs::msg::String message;
  message.data.resize(engine_json_size());
  engine_json_copy(message.data.data());
  state.publish(message);
  observe();
}
void publish_map() {
  nav_msgs::msg::OccupancyGrid message;
  message.header = header();
  message.info.width = 30;
  message.info.height = 20;
  message.info.resolution = 0.4f;
  message.info.origin.orientation.w = 1;
  message.data.reserve(600);
  for (int i = 0; i < 600; i++)
    message.data.push_back(static_cast<int8_t>(engine_value(30, i)));
  map.publish(message);
}
void publish_plan() {
  nav_msgs::msg::Path message;
  message.header = header();
  for (int i = 0; i < static_cast<int>(engine_value(6, 0)); i++) {
    geometry_msgs::msg::PoseStamped point;
    point.header = message.header;
    point.pose.position.x = engine_value(20, i);
    point.pose.position.y = engine_value(21, i);
    point.pose.orientation.w = 1;
    message.poses.push_back(point);
  }
  plan.publish(message);
}
void publish_telemetry() {
  geometry_msgs::msg::Twist twist;
  twist.linear.x = engine_value(3, 0);
  twist.angular.z = engine_value(4, 0);
  velocity.publish(twist);
  nav_msgs::msg::Odometry message;
  message.header = header();
  message.child_frame_id = "base_link";
  message.pose.pose.position.x = engine_value(0, 0);
  message.pose.pose.position.y = engine_value(1, 0);
  const double yaw = engine_value(2, 0);
  message.pose.pose.orientation.z = std::sin(yaw / 2);
  message.pose.pose.orientation.w = std::cos(yaw / 2);
  message.twist.twist = twist;
  odometry.publish(message);
}
void process_goals() {
  if (!goal_subscription)
    return;
  while (goals.take()) {
    // This is the sole route from a browser goal to Rust planning.
    goal_result = engine_goal(goals.message.x, goals.message.y);
    if (goal_result == 0)
      publish_plan();
  }
}
void process_controls() {
  while (controls.take()) {
    engine_control(controls.message.data);
    if (controls.message.data == 0) {
      publish_map();
      publish_plan();
    }
    if (controls.message.data == 3)
      publish_plan();
  }
}
void send_control(unsigned command) {
  std_msgs::msg::UInt8 message;
  message.data = static_cast<uint8_t>(command);
  controls.publish(message);
  process_controls();
  publish_telemetry();
  publish_state();
}
} // namespace

extern "C" {
EMSCRIPTEN_KEEPALIVE int ros_goal(double x, double y) {
  geometry_msgs::msg::Pose2D message;
  message.x = x;
  message.y = y;
  goal_result = 4;
  goals.publish(message);
  process_goals();
  publish_state();
  return goal_result;
}
EMSCRIPTEN_KEEPALIVE void ros_tick() {
  process_controls();
  process_goals();
  engine_tick();
  if (static_cast<unsigned long>(engine_value(5, 0)) % 5 == 0)
    publish_telemetry();
  publish_state();
}
EMSCRIPTEN_KEEPALIVE void ros_pause(int paused) { send_control(paused ? 1 : 2); }
EMSCRIPTEN_KEEPALIVE void ros_reset() { send_control(0); }
EMSCRIPTEN_KEEPALIVE const char *ros_snapshot() { return received_snapshot.c_str(); }
EMSCRIPTEN_KEEPALIVE const char *ros_probe() {
  // Names originate from live rcl handles; counters originate from publish/take calls.
  std::ostringstream out;
  out << "{\"middleware\":\"" << rmw_get_implementation_identifier()
      << "\",\"distro\":\"humble\",\"nodes\":[\"" << rcl_node_get_name(&ui) << "\",\""
      << rcl_node_get_name(&navigator)
      << "\"],\"goal_subscription\":" << (goal_subscription ? "true" : "false") << ",\"topics\":[";
  goals.describe(out);
  out << ",";
  controls.describe(out);
  out << ",";
  state.describe(out);
  out << ",";
  map.describe(out);
  out << ",";
  plan.describe(out);
  out << ",";
  odometry.describe(out);
  out << ",";
  velocity.describe(out);
  out << "],\"observed_map_cells\":" << map.message.data.size()
      << ",\"observed_path_poses\":" << plan.message.poses.size() << ",\"observed_odom\":["
      << odometry.message.pose.pose.position.x << "," << odometry.message.pose.pose.position.y
      << "]}";
  diagnostics = out.str();
  return diagnostics.c_str();
}
// Fault injection for acceptance tests: remove a real subscription, not a JS flag
// that merely changes the display. Restoring it creates a new actual subscription.
EMSCRIPTEN_KEEPALIVE void ros_test_goal_subscription(int enabled) {
  if (!enabled && goal_subscription) {
    check(rcl_subscription_fini(&goals.subscriber, &navigator));
    goal_subscription = false;
  } else if (enabled && !goal_subscription) {
    goals.subscribe(&navigator);
    goal_subscription = true;
  }
}
}
int main() {
  auto allocator = rcl_get_default_allocator();
  auto options = rcl_get_zero_initialized_init_options();
  check(rcl_init_options_init(&options, allocator));
  check(rcl_init(0, nullptr, &options, &context));
  check(rcl_init_options_fini(&options));
  auto node_options = rcl_node_get_default_options();
  node_options.enable_rosout = false;
  check(rcl_node_init(&ui, "browser_ui", "/", &context, &node_options));
  check(rcl_node_init(&navigator, "navigator", "/", &context, &node_options));
  check(rcl_node_options_fini(&node_options));
  goals.init(&ui, &navigator, "/goal_pose", "geometry_msgs/msg/Pose2D");
  controls.init(&ui, &navigator, "/control", "std_msgs/msg/UInt8");
  state.init(&navigator, &ui, "/state", "std_msgs/msg/String");
  map.init(&navigator, &ui, "/map", "nav_msgs/msg/OccupancyGrid");
  plan.init(&navigator, &ui, "/plan", "nav_msgs/msg/Path");
  odometry.init(&navigator, &ui, "/odom", "nav_msgs/msg/Odometry");
  velocity.init(&navigator, &ui, "/cmd_vel", "geometry_msgs/msg/Twist");
  send_control(0);
  return 0;
}
