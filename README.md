# Navigation Monitor

Ứng dụng web **Điều hướng và né vật cản cho robot di động trong Gazebo bằng Machine Learning**. Có Operator View, DS Workspace và bản mockup dùng để đối chiếu thiết kế.

- **Môn học:** Hệ thống thông minh (Intelligent Systems) — ĐH Bách Khoa, ĐHQG-HCM
- **Giảng viên hướng dẫn:** PGS. TS. Quản Thành Thơ
- **Nhóm thực hiện:** Phạm Xuân Hiển · Nguyễn Thành Đạt · Nguyễn Huy Hoàng
- **Phiên bản:** 2.0

## Chạy bản trình diễn

Bản trình diễn dùng **ROS 2 Jazzy và Gazebo Harmonic** trong một container. Bộ chọn **Map** chuyển giữa **Obstacle Arena** cùng robot `demo_robot` và **MazeBot Labyrinth** cùng robot `mazebot`. Operator View hiển thị trạng thái, LiDAR, bản đồ 2D và lệnh điều khiển của robot trên map đang chọn.

DS Workspace mở dữ liệu, kết quả train/test và model tương ứng với map đang chọn. App chỉ dùng bộ 9 feature, bốn nhãn và các model đã train trên cùng map. Người chấm có thể dùng sẵn model đóng gói, hoặc lái tay bằng W/A/D/S để tạo dữ liệu mới. [Lệnh Docker và kịch bản kiểm tra](ros_gazebo_demo/README.md#chạy-web-live-bằng-docker)

## Xem mockup

Phục vụ các file HTML và JSX từ thư mục gốc bằng `python -m http.server 8080`, rồi mở `http://localhost:8080` trong trình duyệt. Để chạy với dữ liệu ROS 2 và Gazebo, xem [hướng dẫn Web live](ros_gazebo_demo/README.md#chạy-web-live-bằng-docker).

Để làm việc với CSV và huấn luyện mô hình trên cùng giao diện, xem [cách chạy DS Workspace trên máy local](ros_gazebo_demo/README.md#chạy-ds-workspace-trên-máy-local).

| File | Nội dung |
| :-- | :-- |
| `Navigation Monitor.html` | Dashboard tương tác (Operator View ↔ DS Workspace) |
| `Monitor Breakdown.html` | 8 trang thuyết minh tiếng Việt |
| `Monitor Breakdown EN.html` | 8 trang thuyết minh tiếng Anh |

## Cấu trúc mã nguồn

```
├── Navigation Monitor.html    # Trang dashboard chính
├── app.jsx                    # Logic điều khiển ứng dụng & state
├── live.jsx                   # App dùng backend Python và Operator View
├── ds-workspace.jsx           # Dataset, training runs và đánh giá mô hình
├── components.jsx             # UI components (Map, Radar, Model Registry, Confusion Matrix, ...)
├── breakdown.jsx / -en.jsx    # Dàn trang 8 sheet thuyết minh (VI/EN)
├── sim.jsx / samples.jsx      # Dữ liệu mô phỏng
├── styles.css                 # Toàn bộ style
└── screens/                   # Ảnh chụp các trạng thái giao diện
```

## Tính năng chính

- **Operator View live** cho phép chọn đích trên bản đồ hoặc nhập tọa độ, bắt đầu lượt lái tay hoặc tự chạy và ghi lịch sử khi kết thúc. Trong lượt lái tay, W/A/D điều khiển robot và S ghi mẫu STOP. Một phiên thu có thể gom mẫu từ nhiều lượt.
- **DS Workspace** hỗ trợ chọn và tải CSV, xem phân bố nhãn, huấn luyện KNN, Gaussian Naive Bayes, Decision Tree và Random Forest, xem confusion matrix và truy lại mẫu dự đoán sai. Có bảng so sánh các lượt tự chạy với cùng điểm xuất phát và đích.
