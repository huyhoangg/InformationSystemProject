# Kế hoạch hoàn thành Navigation Monitor

Checklist theo phạm vi phụ trách của **Hiển** (Gazebo và dữ liệu mô phỏng), **Hoàng** (adapter và Operator View) và **Đạt** (DS Workspace và ML). Bản trình diễn có **Obstacle Arena** và **MazeBot Labyrinth**, chạy chung bằng ROS 2/Gazebo Harmonic. Dùng cùng schema 9 feature và 4 nhãn cho cả hai map.

Đọc [kiến trúc và mô tả mã nguồn](SYSTEM_ARCHITECTURE.md) để tra file, API, schema hiện tại và hợp đồng Gazebo. Đặc tả `FR-01…FR-17` là căn cứ nghiệm thu chức năng. Các panel và thao tác bổ sung của PDF có tiêu chí riêng ở bước 4.

Obstacle Arena và MazeBot Labyrinth trong repo là hai cấu hình của bản nộp. Kết quả chính dùng bộ CSV đóng gói và 48 lượt benchmark. Kết quả thu lại theo rule LiDAR dùng image thử nghiệm riêng. [Báo cáo và minh chứng](../../reports/README.md) · [Thử nghiệm bổ sung](../../reports/reactive-driving/README.md)

## 1. Đã làm

### Hiển · Mô phỏng và dữ liệu mẫu

- [x] Gửi gói đầu gồm code trích đặc trưng, thu CSV, train, chạy model, kết quả và log trên ROS 1 Noetic và Gazebo Classic.
- [x] Bàn giao MazeBot và map mê cung, rồi chuyển sang Gazebo Harmonic cho bản nộp.

### Hoàng · Web live và kết nối demo

- [x] Có mockup chung và hai tab Operator View / DS Workspace, kèm PDF thuyết minh.
- [x] Dựng world/robot mẫu Gazebo Harmonic, ROS 2 Jazzy, launch và Docker. Đấu ba luồng `/scan`, `/odom` và `/cmd_vel`.
- [x] Hiện map demo, pose, trail, vận tốc, radar năm vùng, dự đoán và lệnh phát ra trong Operator View.
- [x] Lái tay bằng nút, lưu mẫu có nhãn vào CSV của phiên đang chạy. Có Start autonomous, Stop và kiểm tra mất telemetry, timeout, mép arena, khoảng cách phía trước.
- [x] Chạy smoke test **demo** cho scan, odometry, gửi vận tốc tiến và dừng. Đã xác nhận robot tiến khoảng 0,158 m và dừng.
- [x] Cấu hình đích demo, hiện marker/khoảng cách/góc và dừng khi vào bán kính đích. Lái tay bằng W/A/D/S, ghi vận tốc đo và nhãn STOP vào CSV cùng LiDAR và hai feature tới đích.
- [x] Nối `/demo/contacts` qua bridge ROS 2 và lưu kết quả theo từng lượt tự chạy. Kiểm thử contact vật lý với hai vật cản trên demo, dừng lượt và chỉ ghi một bản kết quả mỗi lượt. Lịch sử và CSV vẫn có dữ liệu sau khi khởi động lại container với cùng volume.
- [x] Reset phiên trên Gazebo demo. Đưa robot về vị trí xuất phát, làm mới trạng thái/trail/lịch sử phiên hiện tại và giữ CSV cũ trong các phiên đã lưu.

### Đạt · DS Workspace và huấn luyện trong app

- [x] Nối CSV đóng gói, CSV lái tay, phiên đã lưu và CSV upload vào cùng tab DS. Có preview, số mẫu theo lớp và lỗi khi dữ liệu chưa đạt.
- [x] Giữ chung logic chuẩn bị dữ liệu giữa web và CLI. Chia theo nguyên lượt khi CSV có `run_id`, dùng temporal holdout cho CSV cũ, fit scaler trên train và lưu số lượng từng lớp theo split.
- [x] Cho phép đổi đích giữa các lượt trong Operator View. Lượt lái tay và tự chạy cùng kết thúc khi vào bán kính. CSV phiên giữ mẫu theo từng lượt.
- [x] Huấn luyện **KNN, Gaussian Naive Bayes, Decision Tree, Random Forest** và tính majority baseline trên cùng tập test.
- [x] Hiện Accuracy, Macro-F1, Precision, Recall, confusion matrix và chỉ số từng lớp. Bấm ô nhầm lẫn để truy lại mẫu trong CSV của lần train.
- [x] Lưu dataset, model và kết quả theo mã lần train. Hiện trạng thái job, lịch sử và nút tải CSV dùng để tái lập lần train.
- [x] Cho chọn `run_id` + thuật toán khi robot dừng. Operator View phản ánh model active. Có launcher Python để làm DS Workspace khi chưa kết nối robot.
- [x] Kiểm tra trên trình duyệt và API với file 644 mẫu. Bản mẫu 992 dòng báo lỗi đúng do cấu hình lệnh khác. Kiểm tra hai yêu cầu train đồng thời chỉ nhận một job.
- [x] Chạy thử qua Docker **demo** theo luồng lái tay → có CSV → train **CSV tham chiếu** → chọn Random Forest mới → bắt đầu chạy tự động → dừng. Đã kiểm tra từ chối đổi model trong lúc chạy.
- [x] Cập nhật preview, trainer, bundle và giao diện cho CSV 9 feature / 4 nhãn. Các bộ thiếu schema được giữ để đối chiếu trong lưu trữ.
- [x] Thay cách lấy mẫu bằng feature trước khi áp dụng hành động. Đã train với **80 mẫu** mới sau khi reset. CSV 9 feature cũ hiển thị cảnh báo nếu thiếu metadata về thời điểm lấy mẫu.
- [x] Thu mới phiên train và test qua W/A/D/S cho cả hai map. Đóng gói 189/146 mẫu Arena và 419/161 mẫu MazeBot với 9 feature và 4 nhãn. [Nguồn dữ liệu và kết quả](../ros_gazebo_demo/README.md#dữ-liệu-đóng-gói-và-provenance)
- [x] Chuyển CSV tham chiếu cũ, dữ liệu A* và script thu cũ sang lưu trữ ngoài repo. Image bản nộp nạp đúng bốn CSV mới. Dùng volume riêng cho bản nộp.
- [x] Chạy 48 lượt benchmark từ pose xuất phát cố định. Lưu báo cáo, log và ma trận trong `reports` cùng cấp repo. [Tóm tắt kết quả](../ros_gazebo_demo/README.md#kết-quả-điều-hướng-theo-kịch-bản)
- [x] So sánh kết quả các lượt tự chạy theo map, start pose, đích và bán kính tới đích trong DS Workspace.

## 2. Ưu tiên 1 · Cố định bản trình diễn để chạy lại

- [x] Dùng Docker với ROS 2 Jazzy + Gazebo Harmonic và UI web 2D. Bộ chọn map chuyển đúng robot, goal, session, dataset và model. Dùng chung W/A/D/S, auto và log lượt cho hai map.
- [x] Cố định sáu kịch bản trên hai map. Dùng cùng pose xuất phát, đích, bán kính và giới hạn giờ cho các model trong cùng kịch bản. Có ca tới đích, ca bị LiDAR chặn và ca hết giờ. [Cấu hình benchmark](../../reports/materials/protocol.json)
- [x] Build và kiểm tra image Docker mới trong container riêng trên máy phát triển. Đã thu dữ liệu từ image sạch, train trong DS Workspace và chạy tự động tới đích mặc định trên cả hai map với image bản nộp.
- [x] Đưa CSV, manifest, kết quả test, log điều hướng và hướng dẫn tái lập vào bộ nộp và thư mục báo cáo. Đã thử nạp CSV mới, train và deploy qua app.

## 3. Ưu tiên 2 · Hoàn thành đặc tả với dữ liệu của world trong repo

Thứ tự phụ thuộc là **chốt schema → thu dữ liệu → train/test → chạy tự động tới đích → đo hành vi điều hướng**. Có thể làm giao diện và lưu kết quả song song khi schema cùng API đã được chốt.

### Hiển · Kịch bản, dữ liệu và kết quả từ simulator

- [x] Chốt cấu hình dùng trong bản nộp gồm năm vùng LiDAR, tốc độ lệnh, đơn vị và góc tới đích, schema CSV và nhãn `STOP` từ phím S. Manifest lưu feature, tốc độ, mã phiên và mã băm dữ liệu. [Schema và cách thu](../ros_gazebo_demo/README.md#chạy-ds-workspace-trên-máy-local)
- [x] Chuẩn bị ca đi thẳng, rẽ và đích khuất trên hai map. Reset trước từng lượt để so sánh kết quả `reached` và `terminated` từ cùng pose.
- [x] Thu bốn phiên đóng gói bằng sự kiện bàn phím tái hiện vai Operator. Có đủ `FORWARD / LEFT / RIGHT / STOP` với các đích và góc khác nhau. Tách train/test theo mã phiên và lưu số mẫu mỗi lớp.
- [x] Nối contact cho Arena và MazeBot. Đã kiểm chứng event va chạm khi chạm vật cản ở Arena. Log benchmark ghi trạng thái theo dõi contact trên cả hai map.
- [x] Chạy loạt thí nghiệm bản nộp với cùng điều kiện cho từng model. Lưu world, spawn, goal, bán kính, cấu hình reset và log từng lượt. [Log benchmark](../../reports/materials/navigation/)

### Hoàng · Collector, runtime và Operator View

- [x] Đồng bộ `LaserScan` và odometry theo ngưỡng 0,20 s để thu và suy luận. Dùng pose và đích cùng hệ tọa độ world. Cả hai map đã ghi CSV đủ chín feature.
- [x] Kiểm chứng W/A/D/S trên Arena và MazeBot. Nhả phím tiến/rẽ dừng robot, phím S ghi nhãn `STOP`, kể cả sau khi tới đích. **Reset session** lưu phiên đã thu vào volume để mở lại từ DS Workspace.
- [x] Deploy bundle 9 feature, 4 nhãn trên hai map và xác nhận mã model trong log lượt chạy. Lệnh `STOP` phát vận tốc 0.
- [x] Lưu và xuất JSON/CSV theo lượt với ID/model/mã lần train, pose xuất phát, đích, lý do kết thúc, thời gian, quãng đường, số dự đoán, độ trễ và contact.
- [x] Kiểm chứng tới đích theo bán kính, LiDAR chặn tiến, dừng tay và kết thúc ở giới hạn benchmark. Contact Gazebo có trường riêng trong log để tính tỷ lệ va chạm.
- [x] Hiện action, khoảng cách tới đích, trạng thái live và kết quả cuối trong Operator View và `Navigation Runs`.

### Đạt · Dataset, model và đánh giá

- [x] Xác nhận CSV và bundle của cả hai map dùng cùng schema và cấu hình lệnh. Trainer kiểm tra cột, nhãn, đơn vị lệnh và giá trị không hợp lệ.
- [x] Chia train/test theo hai phiên thu độc lập cho từng map. Bốn model dùng cùng split và chỉ fit tiền xử lý trên train. Tham số cố định nên thử nghiệm dùng hai tập train/test.
- [x] Train KNN, Gaussian Naive Bayes, Decision Tree và Random Forest. Lưu tham số, mã băm CSV, phân bố lớp, chỉ số test và confusion matrix **4 × 4**. [Kết quả phân loại bản nộp](../../reports/materials/classification/)
- [x] Kiểm tra CSV có `STOP`, CSV lỗi và luồng nạp CSV mới → train → chọn bundle → xác nhận model đang chạy. Trong DS Workspace có thể xem mẫu dự đoán sai và tải CSV đúng lần train.
- [x] Hiện bảng so sánh điều hướng theo model và kịch bản. Tổng hợp số lượt, tỷ lệ tới đích, tỷ lệ va chạm, thời gian, quãng đường và độ trễ suy luận. Báo cáo ghi rõ cách tính. [Bảng kết quả](../../reports/materials/navigation/summary_by_model.csv)
- [x] Hoàn thành báo cáo thực nghiệm với kết quả 48 lượt và ma trận nhầm lẫn. Đã phân tích điểm offline cùng kết quả tự chạy, gồm Decision Tree tới đích 4/6 lượt trên mỗi map. [Báo cáo Word](../../reports/Bao_cao_danh_gia_dieu_huong_Gazebo.docx)
- [x] Ghi và chạy rule thu bổ sung theo LiDAR qua W/A/D/S. Cố định đích cuối, quay về đích, rẽ về phía thoáng và đi dọc vật cản trước khi hướng lại về đích. Thu 975/417 mẫu Arena và 999/576 mẫu MazeBot. [Rule và quy trình thu](../../reports/reactive-driving/README.md#cách-thu-và-train-lại)
- [x] Tăng giới hạn benchmark lên 45 giây cho thử nghiệm A3/M3. Đo 16 lượt với bộ cũ, train/deploy từ bộ mới rồi đo 16 lượt cùng cấu hình. Cả hai bộ đạt 0/16 ở đích khuất. Kiểm tra thêm đích thẳng trên hai map và lưu log. [So sánh trước và sau](../../reports/reactive-driving/navigation_summary.csv)
- [x] Lưu Accuracy, Balanced Accuracy, Macro Precision, Macro Recall và Macro-F1 cho train/test của bộ thử nghiệm. Tổng hợp 2.967 mẫu theo phiên, nhãn, mức gần vật cản, lượt kết thúc sớm và phân bố chín feature. [Thống kê dữ liệu](../../reports/reactive-driving/README.md#thống-kê-dữ-liệu) · [Điểm train/test](../../reports/reactive-driving/classification/split_metrics.csv)

**Qua bước 3 khi** nhóm thực hiện được **lái tay → thu CSV 4 lớp → train trên web → so sánh trên test độc lập → chọn model → robot chạy tới đích hoặc kết thúc có lý do → xem kết quả điều hướng đã lưu** trên world chính thức.

## 4. Ưu tiên 3 · Hoàn thiện các mục trên mockup

Đối chiếu trang 2–9 của [mockup PDF](<../../docs/Navigation_Monitor_Mockup_EN 3.pdf>) với chế độ live. Hai map live tiếp tục dùng kích thước, hình học và tầm đo thật của Arena và MazeBot. Bản vẽ kho 20 × 14 m và radar 4 m minh họa cách hiển thị ở trang 5.

### Đã có trên live

- [x] Hai tab, điều khiển tay/tự chạy, trạng thái và kết quả cuối trong `Navigation Runs`. Có dự đoán, lệnh đang phát, telemetry, khoảng cách tới đích, bản đồ và radar live.
- [x] DS Workspace có lịch sử train, bảng điểm trên test, ma trận nhầm lẫn, truy vết mẫu sai, chọn model lúc robot dừng và so sánh lịch sử điều hướng theo kịch bản. Manifest lưu tham số, nguồn CSV và artifact model. Log lượt có độ trễ suy luận.
- [x] Tải CSV gốc hoặc CSV theo lần train, kèm nhãn hành động, mã phiên, mã lượt và tọa độ đích.

### Đã nối thêm từ mockup

- [x] **Trang 2–4.** Pause/Resume đóng băng màn hình quan sát, robot tiếp tục chạy tự động. Có đồng hồ lượt và thanh kết quả cuối gồm thời gian, quãng đường, số chu kỳ và lý do kết thúc.
- [x] **Trang 4–6.** Action Hero hiển thị lớp, xác suất của lớp dự đoán, số chu kỳ và lệnh được gửi. Thanh tiến độ tính theo khoảng cách tới đích ban đầu. Bản đồ đánh dấu `START` theo pose xuất phát thật.
- [x] **Trang 6.** Operator Console có lịch sử phím ↑/↓ và lệnh thực, gồm đổi đích khi tự chạy. Cycle Log hiển thị lệnh, khoảng cách và sự kiện. Truy xuất lại được khi lượt đã lưu.
- [x] **Trang 7.** Model Registry hiển thị artifact, tham số, nguồn dataset và thời gian fit cho lần train mới. Hỗ trợ xuất/nhập Decision Tree JSON, deploy giữa lượt tự chạy và ghi mốc đổi model vào log.
- [x] **Trang 7–8.** Shadow B suy luận cùng vector với model A. Hiển thị số lần hai model chọn cùng hành động, số lần khác nhau và độ trễ. Tỷ lệ này đo độ đồng thuận giữa hai model.
- [x] **Trang 9.** Decision Explainer lấy dự đoán gần nhất, đo thay đổi xác suất khi thay từng feature bằng trung vị train và hiện đường quyết định thật cho Decision Tree.
- [x] **Trang 9.** Chọn cột xuất CSV theo chu kỳ. Có feature, dự đoán A/B, lệnh đã gửi, confidence, mã model và thống kê kích thước tệp. `expert_action` để trống khi thiếu nhãn.

### Giới hạn so với mockup

- **Nhãn expert live.** Gazebo cung cấp telemetry và contact. Phiên tự chạy hiện có 0 chu kỳ được gắn nhãn expert, nên live accuracy, rolling accuracy và confusion matrix live chưa có dữ liệu. DS Workspace dùng kết quả test độc lập để chấm mô hình.
- **Tốc độ mô phỏng.** Hai world chạy theo cấu hình Gazebo trong SDF. Bản chạy hiện tại chưa cung cấp điều khiển tốc độ động `1×/4×/16×`.
- **Model upload.** Hỗ trợ định dạng Decision Tree JSON do app xuất, kiểm tra map và schema. Các định dạng `.pkl`, `.joblib`, `.onnx` từ mockup chưa được hỗ trợ. Model Registry báo điểm test cho bản đã đánh giá. Bản import chỉ có artifact và cấu hình điều hướng cho tới khi có kết quả đối chiếu riêng.

## 5. Đối chiếu đặc tả FR-01–FR-17

| FR | Bản nộp hai map | Căn cứ |
| --- | --- | --- |
| FR-01 · Simulator | Đã làm | Arena và MazeBot chạy trong Gazebo, mỗi map có robot, vật cản, cảm biến và đích riêng. |
| FR-02 · Thu sensor và trạng thái | Đã làm | CSV hai map có năm khoảng cách LiDAR, hai vận tốc odometry, khoảng cách và góc tới đích. |
| FR-03 · Năm vùng LiDAR | Đã làm | Adapter lấy khoảng cách nhỏ nhất trong năm vùng định hướng; radar và CSV dùng cùng giá trị. |
| FR-04 · Lái tay bàn phím | Đã làm | W/A/D/S hoạt động trong Operator View trên cả hai map. |
| FR-05 · Nhãn tự động | Đã làm | Ghi bốn nhãn từ phím tương ứng với feature trước lệnh. Phím S ghi `STOP`. |
| FR-06 · Lưu dataset | Đã làm | Có CSV theo phiên và lượt, tải CSV hiện tại và mở lại phiên đã lưu trong DS Workspace. |
| FR-07 · Tiền xử lý | Đã làm | Kiểm tra schema và giá trị, dùng nhãn lớp thống nhất, tách train/test theo phiên cho bộ đóng gói và fit scaler trên train. |
| FR-08 · Bốn thuật toán | Đã làm | Train KNN, GNB, Decision Tree và Random Forest trên hai bộ dữ liệu bản nộp. |
| FR-09 · Metric phân loại | Đã làm | Có accuracy, precision, recall, F1, confusion matrix và điểm từng lớp trên test độc lập. |
| FR-10 · So sánh/chọn model | Đã làm | DS Workspace so sánh trên cùng tập đánh giá và cho chọn model theo mã lần train. |
| FR-11 · Tích hợp model | Đã làm | Kích hoạt bundle hợp lệ trên đúng map và có mã model/dataset trong log. |
| FR-12 · Suy luận theo chu kỳ | Đã làm | ROS adapter tạo vector 9 feature và gọi model đang active theo chu kỳ khi chạy tự động. |
| FR-13 · Ánh xạ sang lệnh | Đã làm | Bốn nhãn được chuyển sang vận tốc ROS, với vận tốc 0 cho `STOP`. |
| FR-14 · Vòng lặp tới đích/kết thúc | Đã làm | Benchmark bản nộp có 16/48 lượt tới đích, các lượt còn lại có lý do kết thúc trong log. |
| FR-15 · Lưu lượt thử | Đã làm | JSON/CSV ghi đích, thời gian, quãng đường, trạng thái cuối và nguồn đo va chạm. |
| FR-16 · So sánh điều hướng | Đã làm | Có bảng theo model và kịch bản trên hai map. Dùng cùng pose, đích và điều kiện cho các model trong cùng ca. |
| FR-17 · Giám sát và kết quả cuối | Đã làm | Operator View hiển thị dự đoán, khoảng cách và trạng thái. `Navigation Runs` lưu kết quả cuối để xem lại. |

## 6. Checklist trước khi trình diễn và nộp

- [x] Có hai ca demo tới đích mặc định, ca LiDAR chặn và ca hết giờ. Reset pose trước từng lượt thử so sánh.
- [x] Kiểm tra thu CSV bằng bàn phím, train bốn model, xem kết quả, chọn bundle, chạy tự động và đối chiếu model trong log trên bản Docker của máy phát triển.
- [x] Lưu CSV thu mới, manifest, bảng điểm, ma trận nhầm lẫn, sơ đồ kịch bản và log. Báo cáo Word dùng kết quả của bộ dữ liệu đóng gói. Thử nghiệm LiDAR có báo cáo và thống kê riêng.

Nguồn đối chiếu nằm cạnh repo trong workspace môn học. [Đặc tả dự án](../../docs/project_specification_submission.md) · [Mockup 9 trang](<../../docs/Navigation_Monitor_Mockup_EN 3.pdf>) · [Sơ đồ nhóm trên Zalo](<../../trao đổi zalo/6.png>) · [Phân công DS](<../../trao đổi zalo/7.png>).
