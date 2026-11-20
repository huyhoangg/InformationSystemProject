# Bản thử kết nối ROS 2 và Gazebo

Bản thử dùng **ROS 2 Jazzy và Gazebo Harmonic** trên Ubuntu 24.04. World `integration_demo` chứa một robot hai bánh, LiDAR 360°, ba vật cản và vách bao quanh sàn. Robot và world là mẫu tạm để kiểm tra kết nối trước khi nhóm nhận mô hình của anh Hiển.

## Ba luồng cần bàn giao cho mốc 22/11

| Topic ROS 2 | Kiểu dữ liệu | Chiều | Topic Gazebo trong bản thử |
| --- | --- | --- | --- |
| `/scan` | `sensor_msgs/msg/LaserScan` | Gazebo → ROS 2 | `/demo/scan` |
| `/odom` | `nav_msgs/msg/Odometry` | Gazebo → ROS 2 | `/demo/odom` |
| `/cmd_vel` | `geometry_msgs/msg/Twist` | ROS 2 → Gazebo | `/demo/cmd_vel` |

Log điều hướng dùng thêm `/contacts` (`ros_gz_interfaces/msg/Contacts`), lấy từ `/demo/contacts` trong Gazebo. Sensor demo theo dõi ba vật cản và các vách bao. Adapter lọc tiếp xúc với sàn. Contact với vật cản kết thúc cả lượt lái tay lẫn lượt tự chạy. Có thể cấu hình `robot_name:=...` nếu tên model Gazebo thay đổi.

Trong demo, `/demo/odom` dùng pose thực của model trong Gazebo để bản đồ, khoảng cách tới đích và quãng đường bám đúng vị trí mô phỏng. DiffDrive vẫn phát odometry tính từ bánh xe ở `/demo/wheel_odom` để đối chiếu khi trượt bánh. [OdometryPublisher của Gazebo Harmonic](https://gazebosim.org/api/sim/8/classgz_1_1sim_1_1systems_1_1OdometryPublisher.html)

`bridge.yaml` khai báo ba luồng một chiều. Khi thay robot/world, cập nhật tên topic Gazebo trong bridge, giữ ba tên ROS 2 để các node phía Python dùng chung giao diện. Node đọc `/scan` dùng QoS `SENSOR_DATA`. Dữ liệu LiDAR tính theo mét, trục x hướng tới trước và trục y hướng sang trái. Lệnh dùng `linear.x` (m/s) và `angular.z` (rad/s). Với world cuối, kiểm tra lại hướng lắp LiDAR, `odom`/`base_link` và vị trí xuất phát để đưa tọa độ odometry lên bản đồ web.

## Chạy Web live bằng Docker

Mở PowerShell ở thư mục gốc dự án. Bản thử chạy Gazebo ẩn, ROS 2 và Web trên cùng máy. Trong lúc build, script của anh Hiển huấn luyện bốn mô hình từ CSV 644 mẫu. Mã huấn luyện, hàm trích đặc trưng và CSV mẫu đều có trong `ros_gazebo_demo/inputs/`. Web nạp các mô hình được huấn luyện trong chính image.

```powershell
docker build -f ros_gazebo_demo/Dockerfile -t isproject-ros-gazebo .
docker run --rm -it --name isproject-ros-gazebo -p 127.0.0.1:8000:8000 -v isproject-training-runs:/demo/runs isproject-ros-gazebo
```

Mở <http://127.0.0.1:8000> và dùng **Operator View**.

1. Trong **Goal**, dùng **Pick on map** rồi bấm một điểm trống trên bản đồ, hoặc nhập X/Y theo mét và bấm **Set goal**.
2. Bấm **Start manual** rồi dùng **W/A/D** hoặc các nút để đi tới đích. **S** hoặc **Record STOP** gửi vận tốc 0 và thu mẫu `stop` trong lượt. Khi một nhịp phím hết hạn, robot dừng và lượt tiếp tục chờ thao tác. **Start autonomous** bắt đầu một lượt dùng model đang active.
3. Khi vào vòng đích, robot dừng, hiển thị **Destination reached** và lưu lượt. Trong lượt lái tay, adapter ghi thêm một mẫu `stop` tại đích nếu có scan/odom đồng bộ với timestamp mới. Dùng **End run** nếu muốn kết thúc sớm. Demo giới hạn 120 giây cho lượt lái tay và 60 giây cho lượt tự chạy. Khi LiDAR chặn tiến trong lượt lái tay, bạn có thể quay để tiếp tục tới đích.
4. Đặt đích tiếp theo rồi bấm Start. Robot xuất phát từ vị trí đang đứng. Các mẫu từ nhiều lượt lái tay cùng được giữ trong CSV phiên hiện tại. Để thu dữ liệu, thử các đường đi có đích khác nhau, cả đoạn thẳng, rẽ và vòng vật cản. Thu từ pose xuất phát mới bằng **Reset session** khi cần đổi cả phiên.

**Reset session** trên thanh đầu trang đưa robot về pose xuất phát, đưa trạng thái về standby, đặt lại đường đi và bắt đầu phiên thu mới với đích đã chọn. CSV lái tay của phiên trước được lưu tự động nếu có mẫu. Có thể chọn lại CSV đó ở **DS Workspace → Saved driving session**. `Navigation Runs` mặc định xem **This session**. Chọn **All sessions** để xem kết quả cũ. Gazebo khôi phục world qua dịch vụ `/world/integration_demo/control`. [API reset của Gazebo](https://gazebosim.org/api/sim/8/reset_simulation.html)

Đích mặc định của world demo là `(1.10, 0.75)` m trong frame odometry, bán kính `0.20` m. Bản đồ vẽ vòng đích theo bán kính này. Khi chạy bằng launch có thể đổi bằng `goal_x:=...`, `goal_y:=...` và `goal_radius:=...`. Các tọa độ cần cùng frame với pose trong `/odom`.

Trong **DS Workspace**, chọn CSV tham chiếu, CSV lái tay của phiên hiện tại hoặc tải lên một file CSV. Kiểm tra số mẫu, phân bố nhãn và cách chia tập rồi bấm `Train models`. App huấn luyện KNN, Gaussian Naive Bayes, Decision Tree và Random Forest trên cùng tập train, sau đó so sánh điểm test với majority baseline. Bấm ô ngoài đường chéo trong confusion matrix để xem các mẫu dự đoán sai.

Chọn `Use …` khi robot đang dừng. Trong **Operator View**, kiểm tra tên model và mã lần train rồi bấm `Start autonomous`. Các lần train hoàn tất và CSV tương ứng được lưu trong volume Docker. CSV lái tay của phiên đang thu nằm trong bộ nhớ. Hãy tải file hoặc train từ phiên đó trước khi tắt container.

`Navigation Runs` trong **Operator View** hiển thị tối đa 20 lượt lái tay hoặc tự chạy gần nhất theo bộ lọc phiên. **Download runs CSV** xuất toàn bộ lượt thuộc bộ lọc đang chọn. Mỗi lượt ghi mã phiên, chế độ, world, pose xuất phát, đích, lý do kết thúc, thời gian theo đồng hồ thực, quãng đường từ odometry và tên vật cản khi có contact. Lượt tự chạy còn ghi model, mã lần train, số dự đoán và độ trễ inference trung bình. Dùng cột `drive_mode` để lọc các lượt tự chạy khi so sánh model.

Log các lượt nằm trong `runs/navigation/`, được giữ qua lần khởi động sau khi gắn volume như lệnh Docker trên. Ở CSV, `collision=1` là đã nhận contact hợp lệ, `0` là trong lượt có publisher ROS contact kết nối và không nhận contact hợp lệ, ô trống là nguồn đo chưa sẵn sàng. Trước khi lấy tỷ lệ va chạm trên world chính thức, thử chạm vật cản và đối chiếu bản ghi. Gazebo dùng contact sensor để phát sự kiện vật lý và bridge chuyển message sang ROS 2. [Cảm biến contact của Gazebo Harmonic](https://gazebosim.org/docs/harmonic/sensors/) · [Kiểu message bridge Jazzy](https://github.com/gazebosim/ros_gz/blob/jazzy/ros_gz_bridge/README.md)

`Mockup` mở giao diện mô phỏng độc lập trong trình duyệt. `Go live` quay lại dữ liệu ROS. Cổng Docker được bind vào localhost để thao tác demo trên máy đang chạy Gazebo.

## Chạy DS Workspace trên máy local

Chạy từ thư mục gốc của repo bằng Python trên Windows, macOS hoặc Linux.

```powershell
python -m pip install scikit-learn
python ros_gazebo_demo/monitor_http.py
```

Mở <http://127.0.0.1:8000>. App tự tạo báo cáo tham chiếu ở lần chạy đầu từ CSV **644 mẫu** của anh Hiển. Các lần train mới nằm trong `ros_gazebo_demo/runs/`. Có thể dùng `--reference-dir` và `--runs-dir` để dùng thư mục riêng cho dev. Nếu đã tạo bộ tham chiếu cũ có SVM, chạy với một `--reference-dir` mới để tạo lại bộ có Random Forest.

Trainer nhận một phiên lái với một trong hai schema dưới đây.

- CSV tham chiếu cũ có 5 vùng LiDAR và 3 lớp `forward`, `left`, `right`.
- CSV live từ Operator View có 9 feature. Ngoài LiDAR, các cột `linear_velocity`, `angular_velocity` là vận tốc đo từ odometry, `goal_distance` tính theo mét và `goal_angle` tính theo radian trong `[-π, π]`. Model dùng cả bốn lớp, gồm `stop`. Các cột `linear_x` và `angular_z` vẫn ghi lệnh đã gửi.

App ghi một mẫu LiDAR/odom ngay trước khi phát lệnh mới và lưu `capture_timing=before_command`. Giữ cùng một phím để kéo dài lệnh hiện tại chỉ ghi một mẫu cho hành động đó. CSV 9 feature cũ thiếu thông tin thời điểm lấy mẫu được đánh dấu trên UI vì vận tốc sau khi phát lệnh có thể tiết lộ nhãn.

Để train phiên live, thu ít nhất 50 quyết định hợp lệ qua ít nhất hai lượt lái tay. Thu đủ `forward`, `left`, `right`, `stop` ở cả nhóm lượt đầu và nhóm lượt cuối. Các dòng CSV mới có `run_id` và tọa độ đích của lượt, cùng `label_source` phân biệt thao tác người lái và mẫu STOP tại đích. Trainer lấy ranh giới giữa hai lượt gần mốc 70% số mẫu nhất, sau đó dùng nguyên các lượt sau ranh giới để test. CSV cũ dùng holdout theo thời gian với vùng đệm. Trainer giữ cấu hình lệnh demo 0,30 m/s và ±0,70 rad/s. File mẫu 992 dòng dùng tốc độ khác nên giao diện báo lỗi khi kiểm tra. Để báo cáo, thu thêm dữ liệu từ phiên độc lập và chạy robot trên các kịch bản đánh giá đã chốt.

`monitor_http.py` phục vụ cả hai tab và các API. `ds_workspace.py` quản lý CSV, train và đọc báo cáo. `navigation_history.py` lưu và xuất log các lượt điều hướng. `web_bridge.py` là adapter ROS 2, lấy pose/twist và contact, tính feature tới đích và suy luận theo schema của model active. Adapter dùng scan và odometry lệch nhau tối đa 0,20 s để ghi CSV 9 feature và suy luận với bundle tương ứng. Khi gắn robot/world chính thức, kiểm tra ba luồng điều khiển/telemetry và topic contact, hệ tọa độ, cấu hình LiDAR và tọa độ đích rồi thu lại dữ liệu.

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
- `train_models.py` chạy độc lập với ROS. CSV mẫu cũ có ba nhãn. CSV mới hỗ trợ thêm lớp `stop`. Mô hình trong ZIP dùng scikit-learn `0.22.2.post1`, nên khi dùng môi trường mới, train lại và nạp mô hình trong cùng môi trường.
- Hai CSV mẫu dùng hai cấu hình vận tốc. `inputs/dataset.csv` lấy từ `manual_20261118_025829_54af3040.csv`, có 644 mẫu ở 0,30 m/s và ±0,70 rad/s, đúng cấu hình trainer và khớp mã băm của lần train gửi kèm. File `manual_20261118_025130_711bd024.csv` có 992 mẫu ở 0,10 m/s và ±0,50 rad/s, nên trainer hiện tại sẽ từ chối file này.
- ZIP dùng KNN, Decision Tree, SVM và Gaussian Naive Bayes. Trainer của app dùng Random Forest cho bộ bốn thuật toán trong đặc tả. Khi chuyển sang robot/world chính thức, thu cả các mẫu người lái chủ động chọn `STOP`.
- Sau khi ba topic hoạt động với world của nhóm, thu CSV bằng bàn phím, train và đánh giá trên các phiên chạy riêng, rồi dùng dữ liệu ROS và kết quả đánh giá để nối vào Web UI. Với bản thử này, bước kiểm tra chỉ gửi vận tốc tiến và dừng.
