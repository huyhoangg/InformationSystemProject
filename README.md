# Navigation Monitor — Mockup Giao diện Giám sát

Bản mockup giao diện web giám sát hệ thống **Điều hướng & Né vật cản của Mobile Robot trong Gazebo dựa trên Machine Learning**.

- **Môn học:** Hệ thống thông minh (Intelligent Systems) — ĐH Bách Khoa, ĐHQG-HCM
- **Giảng viên hướng dẫn:** PGS. TS. Quản Thành Thơ
- **Nhóm thực hiện:** Phạm Xuân Hiển · Nguyễn Thành Đạt · Nguyễn Huy Hoàng
- **Phiên bản:** 2.0

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
- **DS Workspace:** chọn hoặc tải CSV lên, xem phân bố nhãn, huấn luyện KNN, Gaussian Naive Bayes, Decision Tree và Random Forest, so sánh với majority baseline, xem confusion matrix và mẫu dự đoán sai trên tập test. Chọn một model từ lần train bất kỳ khi robot đang dừng.
