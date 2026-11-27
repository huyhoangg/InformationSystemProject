# Navigation Monitor với ROS 2 và Gazebo

Bản trình diễn dùng **ROS 2 Jazzy và Gazebo Harmonic** trên Ubuntu 24.04. **Obstacle Arena** là world `integration_demo` 8 × 8 m với robot `demo_robot`. **MazeBot Labyrinth** là world `mazebot_maze` 12 × 8 m, lấy hình học mê cung và thiết kế robot `mazebot` từ gói của Hiển. Cả hai dùng pose, LiDAR và contact của Gazebo để cập nhật Operator View.

## Luồng dữ liệu của simulator

| Topic ROS 2 | Kiểu dữ liệu | Chiều | Topic Gazebo trong bản thử |
| --- | --- | --- | --- |
| `/scan` | `sensor_msgs/msg/LaserScan` | Gazebo → ROS 2 | `/demo/scan` |
| `/odom` | `nav_msgs/msg/Odometry` | Gazebo → ROS 2 | `/demo/odom` |
| `/cmd_vel` | `geometry_msgs/msg/Twist` | ROS 2 → Gazebo | `/demo/cmd_vel` |

Log điều hướng dùng thêm `/contacts` (`ros_gz_interfaces/msg/Contacts`), lấy từ `/demo/contacts` trong Gazebo. Sensor demo theo dõi ba vật cản và các vách bao. Adapter lọc tiếp xúc với sàn. Contact với vật cản kết thúc cả lượt lái tay lẫn lượt tự chạy. Có thể cấu hình `robot_name:=...` nếu tên model Gazebo thay đổi.

Trong demo, `/demo/odom` dùng pose thực của model trong Gazebo để bản đồ, khoảng cách tới đích và quãng đường bám đúng vị trí mô phỏng. DiffDrive vẫn phát odometry tính từ bánh xe ở `/demo/wheel_odom` để đối chiếu khi trượt bánh. [OdometryPublisher của Gazebo Harmonic](https://gazebosim.org/api/sim/8/classgz_1_1sim_1_1systems_1_1OdometryPublisher.html)

`bridge.yaml` khai báo ba luồng một chiều. Khi thay robot/world, cập nhật tên topic Gazebo trong bridge, giữ ba tên ROS 2 để các node phía Python dùng chung giao diện. Node đọc `/scan` dùng QoS `SENSOR_DATA`. Dữ liệu LiDAR tính theo mét, trục x hướng tới trước và trục y hướng sang trái. Lệnh dùng `linear.x` (m/s) và `angular.z` (rad/s). Với world cuối, kiểm tra lại hướng lắp LiDAR, `odom`/`base_link` và vị trí xuất phát để đưa tọa độ odometry lên bản đồ web.

MazeBot dùng bộ topic riêng `/maze/scan`, `/maze/odom`, `/maze/cmd_vel`, `/maze/contacts` và dịch vụ `/world/mazebot_maze/control`. Mỗi map giữ phiên thu, vị trí robot, đích, model và lịch sử riêng. Dừng lượt hiện tại trước khi dùng bộ chọn **Map** ở thanh đầu trang.

## Chạy Web live bằng Docker

Mở PowerShell ở thư mục gốc dự án. Container chạy hai Gazebo headless, ROS 2 và web. Khi build, app dùng các CSV trong `ros_gazebo_demo/data/` để train bốn model cho từng map, lưu model và đánh giá vào trong image.

```powershell
docker build -f ros_gazebo_demo/Dockerfile -t isproject-ros-gazebo .
docker run --rm -it --name isproject-ros-gazebo -p 127.0.0.1:8000:8000 -v isproject-final-runs:/demo/runs isproject-ros-gazebo
```

Mở <http://127.0.0.1:8000> và dùng **Operator View**.

1. Trong **Goal**, dùng **Pick on map** rồi bấm một điểm trống trên bản đồ, hoặc nhập X/Y theo mét và bấm **Set goal**.
2. Bấm **Start manual** rồi dùng **W/A/D** hoặc các nút để đi tới đích. **S** hoặc **Record STOP** gửi vận tốc 0 và thu mẫu `stop` trong lượt. Khi một nhịp phím hết hạn, robot dừng và lượt tiếp tục chờ thao tác. **Start autonomous** bắt đầu một lượt dùng model đang active.
3. Khi vào vòng đích, robot dừng, hiển thị **Destination reached** và lưu lượt. Sau khi lái tay tới đích, bấm **S** hoặc **Record STOP** để lưu nhãn STOP của lượt vừa xong. Dùng **End run** nếu muốn kết thúc sớm. App giới hạn 120 giây khi lái tay, 60 giây khi tự chạy ở Arena và 90 giây khi tự chạy ở MazeBot. Khi LiDAR chặn tiến trong lượt lái tay, bạn có thể quay để tiếp tục tới đích.
4. Đặt đích tiếp theo rồi bấm Start. Robot xuất phát từ vị trí đang đứng. Các mẫu từ nhiều lượt lái tay cùng được giữ trong CSV phiên hiện tại. Để thu dữ liệu, thử các đường đi có đích khác nhau, cả đoạn thẳng, rẽ và vòng vật cản. Thu từ pose xuất phát mới bằng **Reset session** khi cần đổi cả phiên.

**Reset session** trên thanh đầu trang đưa robot về pose xuất phát, đưa trạng thái về standby, đặt lại đường đi và bắt đầu phiên thu mới với đích đã chọn. CSV lái tay của phiên trước được lưu tự động nếu có mẫu. Có thể chọn lại CSV đó ở **DS Workspace → Saved driving session**. `Navigation Runs` mặc định xem **This session**. Chọn **All sessions** để xem kết quả cũ. Gazebo khôi phục world qua dịch vụ `/world/integration_demo/control`. [API reset của Gazebo](https://gazebosim.org/api/sim/8/reset_simulation.html)

Đích mặc định của Arena là `(0.67, 0.00)` m với bán kính `0.20` m. Đích mặc định của MazeBot là `(-4.30, 3.00)` m với bán kính `0.16` m. Bản đồ vẽ vòng đích theo bán kính của từng world. Khi dùng launch, có thể đổi đích Arena bằng `goal_x:=...`, `goal_y:=...` và `goal_radius:=...`.

Trong **DS Workspace**, chọn **Packaged driving data**, CSV lái tay hiện tại, phiên đã lưu hoặc upload CSV có cùng world. Bảng **Model Comparison** mở kết quả của lần train đóng gói khi vào lần đầu. Chọn **Train models** để tạo lần train mới. App huấn luyện KNN, Gaussian Naive Bayes, Decision Tree và Random Forest trên cùng tập train, sau đó so sánh điểm test với majority baseline. Bấm ô ngoài đường chéo trong confusion matrix để xem các mẫu dự đoán sai.

Để chấm nhanh, mở Operator View và bấm `Start autonomous` với cấu hình ban đầu. Cả hai map chọn Random Forest. Arena chạy từ `(0, 0)` tới `(0.67, 0.00)` và MazeBot chạy từ `(-5, 3)` tới `(-4.30, 3.00)`. Khi so sánh các model, reset về cùng spawn và nhập lại cùng đích. DS Workspace gom các lượt tự chạy theo start pose làm tròn 0,1 m, hướng 5° và đích cùng bán kính. Bảng tách các phiên bản dữ liệu đóng gói theo mã băm. Tỷ lệ va chạm lấy mẫu số là lượt có dữ liệu contact.

Chọn `Use …` khi robot đang dừng. Trong **Operator View**, kiểm tra tên model và mã lần train rồi bấm `Start autonomous`. Khi đang tự chạy, DS Workspace có thao tác riêng **Deploy … mid-run**. Lượt đổi model hoặc đích giữa chừng vẫn được lưu, với dấu mốc trong Cycle Log. Bảng tổng hợp theo kịch bản dùng các lượt giữ nguyên cấu hình. Các lần train hoàn tất và CSV tương ứng được lưu trong volume Docker. CSV lái tay của phiên đang thu nằm trong bộ nhớ. Hãy tải file hoặc train từ phiên đó trước khi tắt container.

`Navigation Runs` trong **Operator View** hiển thị tối đa 20 lượt lái tay hoặc tự chạy gần nhất theo bộ lọc phiên. **Download runs CSV** xuất toàn bộ lượt thuộc bộ lọc đang chọn. Mỗi lượt ghi mã phiên, chế độ, world, pose xuất phát, đích, lý do kết thúc, thời gian theo đồng hồ thực, quãng đường từ odometry và tên vật cản khi có contact. Lượt tự chạy còn ghi model, mã lần train, số dự đoán và độ trễ inference trung bình. Dùng cột `drive_mode` để lọc các lượt tự chạy khi so sánh model.

Log các lượt nằm trong `runs/navigation/`, được giữ qua lần khởi động sau khi gắn volume như lệnh Docker trên. Ở CSV, `collision=1` là đã nhận contact hợp lệ, `0` là trong lượt có publisher ROS contact kết nối và không nhận contact hợp lệ, ô trống là nguồn đo chưa sẵn sàng. Trước khi lấy tỷ lệ va chạm trên world chính thức, thử chạm vật cản và đối chiếu bản ghi. Gazebo dùng contact sensor để phát sự kiện vật lý và bridge chuyển message sang ROS 2. [Cảm biến contact của Gazebo Harmonic](https://gazebosim.org/docs/harmonic/sensors/) · [Kiểu message bridge Jazzy](https://github.com/gazebosim/ros_gz/blob/jazzy/ros_gz_bridge/README.md)

Cổng Docker được bind vào localhost. Volume `isproject-final-runs` lưu các phiên và lần train mới của bản nộp.

Để chạy với lịch sử trắng và vẫn có dữ liệu mẫu, mở container mới từ image đã build với cùng lệnh nhưng bỏ tham số `-v`. Khi dừng container có `--rm`, hãy xuất CSV của phiên hiện tại và các log cần giữ trước.

### Điều khiển và phân tích theo chu kỳ

- **Operator View** hiển thị mốc START, tiến độ tới đích, confidence và tóm tắt cuối lượt. **Pause observation** đóng băng màn hình quan sát trong trình duyệt. Backend tiếp tục điều khiển và ghi log. Dùng **End run** để dừng robot. Trong **Operator Console**, gõ `help` để xem các lệnh, ví dụ `goal -0.8 0.5` hoặc `model use packaged-arena/knn`. Tốc độ mô phỏng theo SDF của từng world.
- **Model Registry** hiển thị nguồn CSV, siêu tham số và thời gian fit ghi từ các lần train mới. Chọn Decision Tree để tải JSON tương thích, rồi dùng **Upload Decision Tree JSON** trên cùng map để nạp vào registry. App kiểm tra schema, cấu trúc cây và xác suất tại lá trước khi dùng artifact. Các bản import có thể deploy và dùng làm Shadow B. Điểm test gắn với lần đánh giá tương ứng.
- **Shadow B** dự đoán từ cùng vector với model A đang điều khiển. DS Workspace hiển thị số chu kỳ đã so sánh, độ đồng thuận và độ trễ suy luận. Trong **Decision Explainer**, chọn **Explain latest prediction** để xem ảnh hưởng lên xác suất khi thay từng feature bằng trung vị tập train. Decision Tree có thêm các ngưỡng đã đi qua.
- **Dataset & Export** cho chọn lượt hiện tại hoặc lượt đã lưu và chọn cột CSV. Mỗi chu kỳ có vector feature, dự đoán, confidence, lệnh đã gửi và thông tin model. JSON chu kỳ nằm trong `runs/navigation/cycles/`. Với dữ liệu hiện tại, cột `expert_action` để trống và chỉ số phân loại được lấy từ tập test offline.

## Chạy DS Workspace trên máy local

Chạy từ thư mục gốc của repo bằng Python trên Windows, macOS hoặc Linux.

```powershell
python -m pip install scikit-learn
python ros_gazebo_demo/monitor_http.py
```

Mở <http://127.0.0.1:8000>. App tạo bộ đánh giá đóng gói lúc khởi động khi CSV hoặc phiên bản scikit-learn thay đổi. Các lần train mới nằm trong `ros_gazebo_demo/runs/`. Có thể dùng `--reference-dir` và `--runs-dir` để chọn nơi lưu riêng.

Trainer nhận một phiên trên một map với 9 feature. Ngoài năm vùng LiDAR, `linear_velocity` và `angular_velocity` là vận tốc đo từ odometry, `goal_distance` tính theo mét và `goal_angle` theo radian trong `[-π, π]`. Bốn nhãn là `forward`, `left`, `right`, `stop`. Cột `linear_x` và `angular_z` lưu riêng lệnh đã gửi.

App ghi LiDAR/odom ngay trước khi phát hành động và lưu `capture_timing=before_command`. Khi giữ lệnh, adapter ghi tiếp mỗi 0,30 s theo mốc LiDAR nếu pose còn đồng bộ. Nhả W/A/D dừng hành động đang giữ. Bấm S mới tạo nhãn STOP. Có thể ghi STOP trong lúc tạm dừng hoặc sau khi lái tay tới đích.

Để train phiên live, thu ít nhất 50 quyết định hợp lệ qua ít nhất hai lượt lái tay. Thu đủ `forward`, `left`, `right`, `stop` ở cả nhóm lượt đầu và nhóm lượt cuối. CSV mới ghi `run_id`, tọa độ đích của lượt và `label_source=operator`. Trainer lấy ranh giới giữa hai lượt gần mốc 70% số mẫu nhất, sau đó dùng nguyên các lượt sau ranh giới để test. Với CSV thiếu mã lượt, trainer dùng holdout theo thời gian với vùng đệm. Trainer kiểm tra cấu hình lệnh 0,30 m/s và ±0,70 rad/s. Để báo cáo, thu thêm dữ liệu từ phiên độc lập và chạy robot trên các kịch bản đánh giá đã chốt.

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

## Dữ liệu đóng gói và provenance

Mỗi map dùng một phiên train và một phiên test thu mới qua W/A/D/S trong các container sạch. Operator Arena chọn hướng theo hành lang LiDAR tại mỗi nhịp. Operator MazeBot lái qua các điểm dẫn đường đã chọn để vòng tường, giữ nguyên đích cuối của từng lượt. Bấm S để ghi STOP sau khi tới đích. Auto-run dùng model dự đoán từ chín feature của đặc tả. [Quy trình thu và đánh giá](../../reports/materials/RULES.md)

| Map | Nguồn | Mẫu | Train / test |
| --- | --- | ---: | ---: |
| Obstacle Arena | Hai phiên Operator riêng gồm 10 lượt train và 6 lượt test. [Train](data/arena.csv) · [Test](data/arena_test.csv) | 745 | 492 / 253 |
| MazeBot Labyrinth | Hai phiên Operator riêng gồm 11 lượt train và 7 lượt test. [Train](data/maze.csv) · [Test](data/maze_test.csv) | 1.037 | 651 / 386 |

Cả bốn CSV dùng `label_source=operator`. Nhãn STOP bắt nguồn từ phím S. Model được fit trên toàn bộ phiên train rồi đánh giá trên phiên test riêng của cùng map. Đây là kết quả phân loại từ image Docker đóng gói.

| Model | Arena Accuracy | Arena Macro-F1 | MazeBot Accuracy | MazeBot Macro-F1 |
| --- | ---: | ---: | ---: | ---: |
| KNN | 84,6% | 0,785 | 93,5% | 0,769 |
| Gaussian Naive Bayes | 85,8% | 0,841 | 93,3% | 0,900 |
| Decision Tree | 82,2% | 0,823 | 90,9% | 0,881 |
| Random Forest | 84,6% | 0,859 | 95,6% | 0,947 |
| Majority baseline | 66,8% | 0,200 | 69,7% | 0,205 |

Kết quả phân loại đo khả năng dự đoán hành động của phiên Operator. Sau khi deploy, đánh giá điều hướng bằng các lượt tự chạy trên cùng kịch bản.

### Kết quả điều hướng theo kịch bản

Benchmark gồm 56 lượt cho bốn model. Robot reset về pose xuất phát trước mỗi lượt và mỗi model lặp hai lần cho từng đích. Arena có bốn ca với giới hạn 45 giây. MazeBot có ba ca với giới hạn 90 giây.

| Model | Arena tới đích | MazeBot tới đích |
| --- | ---: | ---: |
| KNN | 6/8 | 2/6 |
| Gaussian Naive Bayes | 4/8 | 2/6 |
| Decision Tree | 2/8 | 2/6 |
| Random Forest | 6/8 | 2/6 |

Gazebo contact ghi nhận 0 va chạm trong 56 lượt. KNN tới đích 2/2 ở ca A3 sau hộp và Random Forest tới đích 2/2 ở ca A4 xa phía tây bắc. Cả bốn model chưa tới đích ở M2 và M3. [Dữ liệu, ma trận và log final](../../reports/materials/README.md)

FR-03 dùng LiDAR để trích đặc trưng. FR-14 cho phép kết thúc lượt tự chạy và FR-15 yêu cầu lưu trạng thái, thời gian cùng thông tin va chạm. Mức 0,38 m là ngưỡng do app sử dụng. `lidar_clearance` là lý do dừng, còn tỷ lệ va chạm được tính từ contact Gazebo.
