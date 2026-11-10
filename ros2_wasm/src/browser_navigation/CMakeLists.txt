cmake_minimum_required(VERSION 3.8)
project(browser_navigation)
find_package(ament_cmake REQUIRED)
find_package(rcl REQUIRED)
find_package(rmw_wasm_cpp REQUIRED)
find_package(std_msgs REQUIRED)
find_package(geometry_msgs REQUIRED)
find_package(nav_msgs REQUIRED)
add_executable(ros_navigation src/navigation.cpp)
ament_target_dependencies(ros_navigation rcl rmw_wasm_cpp std_msgs geometry_msgs nav_msgs)
target_compile_features(ros_navigation PRIVATE cxx_std_17)
target_link_libraries(ros_navigation
  geometry_msgs::geometry_msgs__rosidl_typesupport_introspection_cpp
  nav_msgs::nav_msgs__rosidl_typesupport_introspection_cpp
  std_msgs::std_msgs__rosidl_typesupport_introspection_cpp)
target_link_options(ros_navigation PRIVATE
  "-lembind" "-fexceptions" "-sDISABLE_EXCEPTION_CATCHING=0"
  "-sALLOW_MEMORY_GROWTH=1" "-sINITIAL_MEMORY=33554432"
  "-sMODULARIZE=1" "-sEXPORT_NAME=createRosNavigation"
  "-sEXIT_RUNTIME=0" "-sENVIRONMENT=web,worker,node" "-sFILESYSTEM=0"
  "-sEXPORTED_FUNCTIONS=['_main','_ros_goal','_ros_tick','_ros_pause','_ros_reset','_ros_snapshot','_ros_probe','_ros_test_goal_subscription']"
  "-sEXPORTED_RUNTIME_METHODS=['UTF8ToString']")
set_target_properties(ros_navigation PROPERTIES SUFFIX ".js")
install(TARGETS ros_navigation DESTINATION lib/${PROJECT_NAME})
ament_package()
