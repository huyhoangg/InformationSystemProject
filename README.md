# Navigation Monitor — Mockup Giao diện Giám sát

Bản mockup giao diện web giám sát hệ thống **Điều hướng & Né vật cản của Mobile Robot trong Gazebo dựa trên Machine Learning**.

- **Môn học:** Hệ thống thông minh (Intelligent Systems) — ĐH Bách Khoa, ĐHQG-HCM
- **Giảng viên hướng dẫn:** PGS. TS. Quản Thành Thơ
- **Nhóm thực hiện:** Phạm Xuân Hiển · Nguyễn Thành Đạt · Nguyễn Huy Hoàng
- **Phiên bản:** 2.0

## Xem mockup

Phục vụ các file HTML và JSX từ thư mục gốc bằng `python -m http.server 8080`, rồi mở `http://localhost:8080` trong trình duyệt. Để chạy với dữ liệu ROS 2 và Gazebo, xem [hướng dẫn Web live](ros_gazebo_demo/README.md#chạy-web-live-bằng-docker).

| File | Nội dung |
| :-- | :-- |
| `Navigation Monitor.html` | Dashboard tương tác (Operator View ↔ DS Workspace) |
| `Monitor Breakdown.html` | 8 trang thuyết minh tiếng Việt |
| `Monitor Breakdown EN.html` | 8 trang thuyết minh tiếng Anh |

## Cấu trúc mã nguồn

```
├── Navigation Monitor.html    # Trang dashboard chính
├── app.jsx                    # Logic điều khiển ứng dụng & state
├── live.jsx                   # Operator View và DS Workspace dùng backend ROS 2
├── components.jsx             # UI components (Map, Radar, Model Registry, Confusion Matrix, ...)
├── breakdown.jsx / -en.jsx    # Dàn trang 8 sheet thuyết minh (VI/EN)
├── sim.jsx / samples.jsx      # Dữ liệu mô phỏng
├── styles.css                 # Toàn bộ style
└── screens/                   # Ảnh chụp các trạng thái giao diện
```

## Tính năng chính

- **Operator View:** điều khiển thủ công (W/A/S/D) có gán nhãn dữ liệu, theo dõi dự đoán mô hình realtime 5 Hz, bản đồ vị trí, radar 5 vùng LiDAR, cycle log.
- **DS Workspace:** Model Registry (KNN, GNB, Decision Tree, Random Forest) với hot-swap & shadow model, Live Prediction Quality, Confusion Matrix 4×4, Decision Explainer (XAI), Export dataset CSV, so sánh A/B mô hình.
