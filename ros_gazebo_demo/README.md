# Bản thử kết nối ROS 2 và Gazebo

Bản thử dùng **ROS 2 Jazzy và Gazebo Harmonic** trên Ubuntu 24.04. World `integration_demo` chứa một robot hai bánh, LiDAR 360° và ba vật cản. Robot và world là mẫu tạm để kiểm tra kết nối trước khi nhóm nhận mô hình của anh Hiển.

## Ba luồng cần bàn giao cho mốc 22/11

| Topic ROS 2 | Kiểu dữ liệu | Chiều | Topic Gazebo trong bản thử |
| --- | --- | --- | --- |
| `/scan` | `sensor_msgs/msg/LaserScan` | Gazebo → ROS 2 | `/demo/scan` |
| `/odom` | `nav_msgs/msg/Odometry` | Gazebo → ROS 2 | `/demo/odom` |
| `/cmd_vel` | `geometry_msgs/msg/Twist` | ROS 2 → Gazebo | `/demo/cmd_vel` |

`bridge.yaml` khai báo ba luồng một chiều. Khi thay robot/world, cập nhật tên topic Gazebo trong bridge, giữ ba tên ROS 2 để các node phía Python dùng chung giao diện. Node đọc `/scan` dùng QoS `SENSOR_DATA`. Dữ liệu LiDAR tính theo mét, trục x hướng tới trước và trục y hướng sang trái. Lệnh dùng `linear.x` (m/s) và `angular.z` (rad/s). Với world cuối, kiểm tra lại hướng lắp LiDAR, `odom`/`base_link` và vị trí xuất phát để đưa tọa độ odometry lên bản đồ web.

## Chạy Web live bằng Docker

Mở PowerShell ở thư mục gốc dự án. Bản thử chạy Gazebo ẩn, ROS 2 và Web trên cùng máy. Trong lúc build, script của anh Hiển huấn luyện bốn mô hình từ CSV 644 mẫu. Mã huấn luyện, hàm trích đặc trưng và CSV mẫu đều có trong `ros_gazebo_demo/inputs/`. Web nạp các mô hình được huấn luyện trong chính image.

```powershell
docker build -f ros_gazebo_demo/Dockerfile -t isproject-ros-gazebo .
docker run --rm -it --name isproject-ros-gazebo -p 127.0.0.1:8000:8000 isproject-ros-gazebo
```

Mở <http://127.0.0.1:8000>. **Operator View** hiển thị bản đồ của world đang chạy, odometry, LiDAR, hành động mô hình dự đoán và lệnh đã gửi. Các nút `Left`, `Forward`, `Right` gửi một nhịp điều khiển và ghi mẫu gán nhãn. `Start autonomous` sử dụng mô hình đang chọn. `Stop` dừng lượt chạy. Backend dừng khi mất dữ liệu ROS, khi hết thời gian chạy hoặc khi LiDAR chặn lệnh tiến sát vật cản.

**DS Workspace** hiển thị kết quả tập test và ma trận nhầm lẫn cho từng mô hình. Chọn `Use …` khi robot đang dừng, sau đó quay lại Operator View để chạy mô hình vừa chọn. Trang cho tải CSV tham chiếu và CSV lái tay của phiên hiện tại. Tải CSV phiên lái trước khi tắt container vì dữ liệu thu giữ trong bộ nhớ. Các điểm đánh giá được tạo sẵn lúc build từ một phiên lái tay.

`Mockup` mở giao diện mô phỏng độc lập trong trình duyệt. `Go live` quay lại dữ liệu ROS. Cổng Docker được bind vào localhost để thao tác demo trên máy đang chạy Gazebo.

## Kiểm tra riêng ROS và Gazebo

Mở terminal thứ hai khi Gazebo vừa khởi động và trước khi gửi lệnh từ Web.

```powershell
docker exec isproject-ros-gazebo /ros_entrypoint.sh python3 /demo/smoke_test.py
```

Phép kiểm tra đợi LiDAR và odometry, gửi vận tốc tiến, xác nhận x tăng ít nhất 0,15 m và khoảng cách tới tường giảm ít nhất 0,10 m, rồi xác nhận robot dừng. Kết quả đạt có ba dòng `PASS`. Nếu muốn chạy lại từ đầu, dừng container bằng Ctrl+C ở terminal 1 rồi chạy lại `docker run`.

## Chạy trực tiếp khi đã có ROS 2 Jazzy và Gazebo Harmonic

```bash
source /opt/ros/jazzy/setup.bash
ros2 launch ros_gazebo_demo/demo.launch.py
```

Ở terminal khác, nạp cùng môi trường ROS và chạy `python3 ros_gazebo_demo/smoke_test.py`. Để mở cửa sổ Gazebo trên máy có môi trường đồ họa, thêm `headless:=false` vào lệnh `ros2 launch`.

Để chạy Web trong môi trường này, cài `python3-sklearn`, tạo bộ mô hình tham chiếu một lần và bật tham số `web`.

```bash
python3 ros_gazebo_demo/prepare_models.py
ros2 launch ros_gazebo_demo/demo.launch.py web:=true
```

## Dùng lại phần anh Hiển đã làm

- `robot_ml.zip` dùng ROS 1 Noetic và Gazebo Classic 11. ZIP có code, CSV, mô hình và log chạy thử. File robot, world và launch Gazebo cần lấy cùng bản bàn giao của anh Hiển.
- `lidar_features.py` đọc `LaserScan` và rút ra khoảng cách nhỏ nhất ở năm vùng theo thứ tự `left`, `front_left`, `front`, `front_right`, `right`. Hàm trích đặc trưng dùng Python thuần. `collect_data.py` và `run_robot.py` dùng `rospy`, nên cần chuyển phần giao tiếp topic sang `rclpy` khi gắn vào bản ROS 2.
- `train_models.py` chạy độc lập với ROS. Mỗi lượt train hiện nhận đúng một phiên thu và ba nhãn `forward`, `left`, `right`. Lệnh vận tốc 0 là thao tác dừng; CSV mẫu chưa có lớp `stop`. Mô hình gửi kèm dùng scikit-learn `0.22.2.post1`, nên khi dùng môi trường mới, train lại và nạp mô hình trong cùng môi trường.
- Hai CSV mẫu dùng hai cấu hình vận tốc. `inputs/dataset.csv` lấy từ `manual_20261118_025829_54af3040.csv`, có 644 mẫu ở 0,30 m/s và ±0,70 rad/s, đúng cấu hình trainer và khớp mã băm của lần train gửi kèm. File `manual_20261118_025130_711bd024.csv` có 992 mẫu ở 0,10 m/s và ±0,50 rad/s, nên trainer hiện tại sẽ từ chối file này.
- ZIP dùng KNN, Decision Tree, SVM và Gaussian Naive Bayes. `takenote.pdf` liệt kê Random Forest thay SVM, và liệt kê `STOP` như một lớp dự đoán. Nhóm cần chốt hai điểm này trước khi thu bộ dữ liệu và làm bảng đánh giá cuối.
- Sau khi ba topic hoạt động với world của nhóm, thu CSV bằng bàn phím, train và đánh giá trên các phiên chạy riêng, rồi dùng dữ liệu ROS và kết quả đánh giá để nối vào Web UI. Với bản thử này, bước kiểm tra chỉ gửi vận tốc tiến và dừng.
