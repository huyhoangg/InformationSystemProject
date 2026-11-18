FROM ros:jazzy-ros-base AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    libegl-mesa0 \
    libgl1-mesa-dri \
    ros-jazzy-ros-gz-bridge \
    ros-jazzy-ros-gz-sim \
    && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y --no-install-recommends python3-sklearn \
    && rm -rf /var/lib/apt/lists/*

FROM runtime
ENV LIBGL_ALWAYS_SOFTWARE=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
WORKDIR /demo
COPY ros_gazebo_demo/bridge.yaml ros_gazebo_demo/demo.launch.py ros_gazebo_demo/demo.sdf ros_gazebo_demo/smoke_test.py ros_gazebo_demo/web_bridge.py ros_gazebo_demo/prepare_models.py ./
COPY ["Navigation Monitor.html", "app.jsx", "components.jsx", "icons.jsx", "live.jsx", "sim.jsx", "styles.css", "./web/"]
COPY ros_gazebo_demo/inputs/ ./inputs/
RUN python3 prepare_models.py
EXPOSE 8000
CMD ["ros2", "launch", "/demo/demo.launch.py", "web:=true", "web_host:=0.0.0.0"]
