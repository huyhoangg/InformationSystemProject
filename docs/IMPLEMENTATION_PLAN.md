# Kế hoạch hoàn thành Navigation Monitor

Checklist theo phạm vi phụ trách của **Hiển** (Gazebo và dữ liệu mô phỏng), **Hoàng** (adapter và Operator View) và **Đạt** (DS Workspace và ML). Mục đã tick có dữ liệu bàn giao, mã nguồn hoặc đã được kiểm thử ở bản hiện tại. Mục ghi **demo** mới được nghiệm thu với world `integration_demo` trong repo. Mục còn lại có tiêu chí để cả nhóm biết khi nào có thể tick.

Đọc [kiến trúc và mô tả mã nguồn](SYSTEM_ARCHITECTURE.md) để tra file, API, schema hiện tại và hợp đồng Gazebo. Đặc tả `FR-01…FR-17` là căn cứ nghiệm thu chức năng. Các panel và thao tác bổ sung của PDF có tiêu chí riêng ở bước 4.

## 1. Đã làm

### Hiển · Mô phỏng và dữ liệu mẫu

- [x] Gửi `robot_ml.zip` gồm code trích đặc trưng, thu CSV, train, chạy model, kết quả và log. Bản thử của Hiển dùng ROS 1 Noetic và Gazebo Classic 11.
- [x] Thu hai phiên lái tay có cấu hình vận tốc khác nhau. Bàn giao file **644 mẫu** được dùng trong app và file **992 mẫu** để đối chiếu.
- [x] Có log chạy thử KNN và Decision Tree trong nguyên mẫu. Đây là bằng chứng đã chạy inference, chưa có kết quả đo tỷ lệ tới đích hoặc va chạm của world chính thức.

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

- [x] Nối CSV tham chiếu, CSV lái tay và CSV upload vào cùng tab DS. Có preview, số mẫu theo lớp và lỗi khi dữ liệu chưa đạt.
- [x] Giữ chung logic chuẩn bị dữ liệu giữa web và CLI. Chia theo nguyên lượt khi CSV có `run_id`, dùng temporal holdout cho CSV cũ, fit scaler trên train và lưu số lượng từng lớp theo split.
- [x] Cho phép đổi đích giữa các lượt trong Operator View. Lượt lái tay và tự chạy cùng kết thúc khi vào bán kính. CSV phiên giữ mẫu theo từng lượt.
- [x] Huấn luyện **KNN, Gaussian Naive Bayes, Decision Tree, Random Forest** và tính majority baseline trên cùng tập test.
- [x] Hiện Accuracy, Macro-F1, Precision, Recall, confusion matrix và chỉ số từng lớp. Bấm ô nhầm lẫn để truy lại mẫu trong CSV của lần train.
- [x] Lưu dataset, model và kết quả theo mã lần train. Hiện trạng thái job, lịch sử và nút tải CSV dùng để tái lập lần train.
- [x] Cho chọn `run_id` + thuật toán khi robot dừng. Operator View phản ánh model active. Có launcher Python để làm DS Workspace khi chưa kết nối robot.
- [x] Kiểm tra trên trình duyệt và API với file 644 mẫu. Bản mẫu 992 dòng báo lỗi đúng do cấu hình lệnh khác. Kiểm tra hai yêu cầu train đồng thời chỉ nhận một job.
- [x] Chạy thử qua Docker **demo** theo luồng lái tay → có CSV → train **CSV tham chiếu** → chọn Random Forest mới → bắt đầu chạy tự động → dừng. Đã kiểm tra từ chối đổi model trong lúc chạy.
- [x] Cập nhật preview, trainer, bundle và giao diện cho CSV 9 feature / 4 nhãn, đồng thời giữ CSV tham chiếu 5 feature / 3 nhãn. Đã train từ **147 mẫu Gazebo demo**, gồm 36 mẫu STOP, rồi kích hoạt Random Forest 9 feature và chạy suy luận trên Gazebo.
- [x] Thay cách lấy mẫu bằng feature trước khi áp dụng hành động. Đã train với **80 mẫu** mới sau khi reset. CSV 9 feature cũ hiển thị cảnh báo nếu thiếu metadata về thời điểm lấy mẫu.

## 2. Ưu tiên 1 · Nối robot và world chính thức

**Mốc đã ghi trong README hiện tại là 22/11 cho ba luồng kết nối.** Dùng mốc này để nghiệm thu `/scan`, `/odom` và `/cmd_vel` trên bản bàn giao thực tế. Giữ world demo để kiểm tra độc lập khi cần tìm lỗi.

### Hiển · Bàn giao Gazebo

- [ ] Chốt cùng Hoàng bản ROS/Gazebo dùng để trình diễn. Xác nhận có thể đưa robot/world sang Jazzy + Harmonic hay giữ Noetic + Classic 11. Ghi quyết định và lệnh chạy vào README.
- [ ] Bàn giao world, robot, mesh/texture/plugin và launch. Kèm cách khởi động, reset về spawn và chạy trên máy của thành viên khác.
- [ ] Bàn giao tên topic, kiểu message, tần số, đơn vị, QoS nếu dùng ROS 2, frame LiDAR, frame odometry và dấu trục. Kiểm tra tiến, quay trái, quay phải và vận tốc 0 ngay trong Gazebo.
- [ ] Bàn giao hình học map, origin/hướng, spawn pose, vị trí đích, bán kính tới đích theo kịch bản và nguồn event contact. Xác định cách phân biệt va chạm vật cản với tiếp xúc bình thường của bánh xe và sàn.

### Hoàng · Ráp adapter với app

- [ ] Với Harmonic, cập nhật launch và mapping topic Gazebo. Với Noetic, cung cấp adapter `rospy` theo giao diện `MonitorServer`. Giữ app truy cập cùng API HTTP.
- [ ] Ráp dữ liệu map chính thức vào Operator View. Kiểm tra robot/goal/trail trùng vị trí mô phỏng ở spawn và sau khi tiến/quay. Dùng transform nếu world và odometry lệch origin hoặc yaw.
- [ ] Kiểm tra scan có dữ liệu ở đủ năm hướng, dấu lệnh quay đúng, vận tốc đo thay đổi và lệnh dừng về 0. Kiểm tra mất scan/odom trong khi chạy và khởi động lại Gazebo để phát hiện lỗi timestamp/reset.
- [ ] Xác nhận Operator View lái được robot chính thức, hiển thị telemetry và ghi được CSV từ phiên lái. Đưa tên model/mã lần train lên UI để đối chiếu lúc bấm Start autonomous.
- [ ] Cập nhật lệnh chạy từ checkout sạch và lưu kết quả smoke test bản chính thức. Đạt thử lại từ một máy khác nếu môi trường tích hợp cho phép.

### Đạt · Nối dữ liệu thật

- [ ] Đọc CSV xuất từ adapter bản chính thức cùng Hoàng. Kiểm tra thứ tự vùng LiDAR, nhãn/lệnh và thời điểm scan tăng theo phiên. Dùng một phiên đủ mẫu để chạy thử train từ chính CSV đó.
- [ ] Kiểm tra luồng load bundle `run_id + model` sau khi adapter thay đổi. Xác nhận profile cảm biến, schema và môi trường scikit-learn giống lúc train trước khi cho robot chạy.
- [ ] Đưa các thay đổi app và tài liệu vào repo chung để cả nhóm chạy cùng phiên bản. Rà lại README để người mới nhận biết đường chạy mockup, DS local và demo live.

**Qua bước 2 khi** app điều khiển được robot chính thức trong Operator View, đo được odometry, đọc được LiDAR, ghi được CSV cùng cấu hình và có lệnh chạy tái lập.

## 3. Ưu tiên 2 · Hoàn thành đặc tả với dữ liệu của world chính thức

Thứ tự phụ thuộc là **chốt schema → thu dữ liệu → train/test → chạy tự động tới đích → đo hành vi điều hướng**. Có thể làm giao diện và lưu kết quả song song khi schema cùng API đã được chốt.

### Hiển · Kịch bản, dữ liệu và kết quả từ simulator

- [ ] Chốt với Hoàng và Đạt hình học năm vùng LiDAR, tốc độ cho từng lệnh, đơn vị/góc đích và cách gắn nhãn `STOP`. Cùng thống nhất tên cột, phiên bản schema và ghi cấu hình cho từng phiên.
- [ ] Chuẩn bị các kịch bản spawn–goal có đường thẳng, rẽ và né vật cản. Kiểm tra reset cho kết quả bắt đầu nhất quán và có trường hợp dùng để kiểm thử reached/terminated.
- [ ] Thu nhiều phiên lái tay có bốn nhãn `FORWARD / LEFT / RIGHT / STOP`, nhiều khoảng cách và góc tới đích. Ghi đủ số lượng mỗi lớp và giữ nguyên mã phiên để tách tập đánh giá theo phiên.
- [ ] Cung cấp tín hiệu contact và kiểm chứng có event khi chạm vật cản. Phối hợp Hoàng kiểm tra dừng tự động tại bán kính goal, collision và timeout.
- [ ] Chạy loạt thí nghiệm ở cùng điều kiện cho từng model. Ghi world, spawn, goal và cấu hình reset để Đạt tổng hợp số liệu.

### Hoàng · Collector, runtime và Operator View

- [ ] Kiểm tra trên robot chính thức rằng timestamp `LaserScan` và odometry đủ gần, chín feature và lệnh được ghi đúng đơn vị. Điều chỉnh phép đổi frame nếu pose và đích dùng hệ tọa độ khác nhau.
- [ ] Kiểm chứng thu dữ liệu bằng **W/A/D/S** và nhãn `STOP` trên robot chính thức. Bổ sung cách kết thúc/lưu từng phiên độc lập để giữ dữ liệu qua việc đóng container.
- [ ] Nghiệm thu bundle 9 feature cùng bốn nhãn trên adapter chính thức, gồm `STOP` phát vận tốc 0 và cách runtime phản ứng khi thiếu dữ liệu hoặc mất kết nối.
- [ ] Nghiệm thu log theo lượt trên world chính thức. Kiểm tra ID/model/mã lần train, pose xuất phát, đích, lý do kết thúc, thời gian, quãng đường, số dự đoán, độ trễ và contact trong JSON/CSV.
- [ ] Xác thực reached, va chạm, timeout và dừng tay trên world chính thức. Đối chiếu contact vật cản, tiếp xúc sàn và trường hợp LiDAR chặn tiến để chốt cách chấm tỷ lệ va chạm.
- [ ] Bổ sung tiến độ và cycle log ở Operator View theo mockup. Kiểm tra người dùng đổi tab hoặc ngừng quan sát trong khi robot vẫn tự chạy và mở lại được kết quả trong `Navigation Runs`.

### Đạt · Dataset, model và đánh giá

- [ ] Chốt schema và cấu hình vận tốc với Hiển/Hoàng, kiểm tra CSV và bundle chính thức tương thích với các kiểm tra đã chạy trên demo.
- [ ] Chia train/test theo phiên độc lập khi đủ dữ liệu. Nếu tinh chỉnh tham số, dùng validation riêng và giữ test cố định đến cuối. Tất cả thuật toán dùng cùng split, chỉ fit tiền xử lý trên train.
- [ ] Train lại KNN, Gaussian Naive Bayes, Decision Tree và Random Forest. Lưu cấu hình, mã/hash dataset, class counts, metric và confusion matrix **4 × 4** để truy vết.
- [ ] Kiểm thử tiếp nhận CSV có `STOP`, lỗi dữ liệu, train cả bốn model và triển khai đúng bundle vào runtime mới. Hiển thị nguồn, phiên bản và trạng thái active nhất quán giữa hai tab.
- [ ] Dùng log lượt thử của Hoàng/Hiển để hiển thị bảng điều hướng theo model. Tổng hợp số lượt, tỷ lệ tới đích, tỷ lệ va chạm, thời gian, quãng đường và độ trễ inference. Ghi số lượt và quy tắc tính trung bình để so sánh công bằng.
- [ ] Phân tích kết quả phân loại và điều hướng trong báo cáo. Dùng các mẫu sai có truy vết để giải thích trường hợp như model đoán nhãn khá tốt nhưng điều khiển robot kém trong một kịch bản.

**Qua bước 3 khi** nhóm thực hiện được **lái tay → thu CSV 4 lớp → train trên web → so sánh trên test độc lập → chọn model → robot chạy tới đích hoặc kết thúc có lý do → xem kết quả điều hướng đã lưu** trên world chính thức.

## 4. Ưu tiên 3 · Hoàn thiện các mục trên mockup

Dùng các trang PDF để rà nghiệm thu giao diện sau khi dữ liệu live có đủ. Với mục thay đổi so với mockup, nhóm ghi quyết định và cập nhật mockup/báo cáo để màn hình trình bày khớp dữ liệu đang có.

| Trang | Hạng mục | Phụ trách | Tình trạng live |
| --- | --- | --- | --- |
| 2–3 | Bố cục hai tab, trạng thái thí nghiệm, endbar | Hoàng | Có hai tab, trạng thái live và kết quả theo lượt. Cần endbar và hành vi pause/resume theo mockup. |
| 4–5 | Action Hero, telemetry, Distance to Goal, map, radar, điều khiển | Hoàng + Hiển | Có hành động, telemetry, đích, bản đồ, radar và hotkey trên demo. Cần tiến độ và dữ liệu của world chính thức. |
| 6 | Console, cycle log và sự kiện | Hoàng | Mockup có panel. Live cần endpoint/hành vi tương ứng và log thật. |
| 7 | Model Registry, A/B shadow, lịch sử điều hướng | Đạt + Hoàng | Có lựa chọn model theo lần train, bảng test và kích hoạt lúc dừng. Cần metadata và shadow/lịch sử live. |
| 8 | Prediction Quality và confusion matrix đối chiếu expert live | Đạt + Hoàng + Hiển | Có confusion matrix và soi mẫu sai trên test. Live cần nhãn tham chiếu hợp lệ. |
| 9 | Decision Explainer và Dataset Export | Đạt | Có tải CSV gốc/CSV đúng lần train. Cần giải thích theo model và luồng xuất tùy cột phục vụ gán nhãn lại nếu giữ giao diện PDF. |

- [x] Có giao diện minh họa đầy đủ các nhóm panel trong bản mockup. Có dữ liệu thật cho bảng điểm, ma trận, lỗi theo dòng và xuất CSV ở chế độ backend.
- [ ] **Hoàng** nối Action Hero và endbar với vòng đời live. Chốt cách diễn giải Pause/Resume. Nếu Pause dùng để dừng quan sát, trạng thái thực của robot vẫn được cập nhật ở backend.
- [ ] **Hoàng + Hiển** đối chiếu kích thước warehouse, vùng quét và legend radar với world chính thức. Trang 5 minh họa map 20 × 14 m và mốc 0,6/1,4 m. Cập nhật số hiển thị theo cấu hình nhóm nghiệm thu.
- [ ] **Hoàng** nối console với lệnh thật và ghi event. Đối chiếu `start / pause / resume / terminate / restart / status / clear`, `goal <x> <y>`, `model use <id>`, lịch sử lệnh và ba mức tốc độ 1×/4×/16× trong PDF. Nhóm thống nhất thao tác nào dùng cho quan sát, thao tác nào thay đổi simulator hoặc kịch bản. Tốc độ mô phỏng và vận tốc robot cần có nhãn riêng.
- [ ] **Đạt** bổ sung metadata Model Registry như hyperparameters, thời gian train, dataset nguồn, inference và artifact. Nếu giữ nút upload model trong PDF, chốt định dạng được hỗ trợ, nguồn artifact, kiểm tra schema/phiên bản và điều kiện kích hoạt. Nếu giữ hot-swap giữa lượt, ghi rõ model nào điều khiển từng đoạn và test chuyển trạng thái an toàn.
- [ ] **Hoàng + Đạt** nối Shadow B để tính dự đoán trên cùng vector và timestamp với model A. Model A phát lệnh; lưu model ID và độ trễ của cả hai. Dùng lịch sử cùng kịch bản cho bảng A/B ở cấp lượt chạy.
- [ ] **Hiển + Hoàng + Đạt** chốt cách lấy nhãn expert cho các chu kỳ được chấm, ví dụ nhãn do người đánh giá gán trên replay có timestamp. Khi có nhãn, hiện tỷ lệ khớp, rolling accuracy, review mismatch và confusion matrix live. Hiện số chu kỳ đủ nhãn để người xem biết mẫu số.
- [ ] **Đạt** triển khai Decision Explainer bằng phương pháp phù hợp với model và gắn giải thích với một dự đoán cụ thể. Chỉ hiện confidence khi model cung cấp được đại lượng có ý nghĩa và ghi rõ cách tính.
- [ ] **Đạt + Hoàng** cập nhật Dataset Export với mã lượt, chọn cột, bộ lọc mismatch và nhãn tham chiếu khi có. Kiểm tra CSV tải xuống có đủ feature, action và metadata để gán nhãn lại/tái lập.
- [ ] **Cả nhóm** chụp màn hình live mới và cập nhật PDF/thuyết minh theo dữ liệu nghiệm thu. Ghi rõ các chức năng bổ sung mà nhóm hoặc giảng viên đồng ý điều chỉnh nếu phạm vi thay đổi.

## 5. Đối chiếu đặc tả FR-01–FR-17

| FR | Mức hiện tại | Căn cứ để chốt hoàn thành |
| --- | --- | --- |
| FR-01 · Simulator | Demo | World chính thức có robot, vật cản, cảm biến và đích. |
| FR-02 · Thu sensor và trạng thái | Đã làm ở demo | Kiểm chứng chín feature và độ khớp timestamp trên robot chính thức. |
| FR-03 · Năm vùng LiDAR | Đã làm ở demo | Xác nhận góc, frame và thứ tự vùng trên robot chính thức. |
| FR-04 · Lái tay bàn phím | Đã làm ở demo | W/A/D/S hoạt động trong luồng thu app chính thức. |
| FR-05 · Nhãn tự động | Đã làm ở demo | Kiểm chứng đủ bốn lớp, nhãn tương ứng scan và tách sự kiện dừng khỏi nhãn `STOP`. |
| FR-06 · Lưu dataset | Một phần | CSV có schema đầy đủ, phiên/nguồn rõ và tải lại được. |
| FR-07 · Tiền xử lý | Có pipeline mẫu | Validate schema cuối, split theo phiên và fit biến đổi trên train. |
| FR-08 · Bốn thuật toán | Đã làm | Train cả bốn model từ dataset cuối. |
| FR-09 · Metric phân loại | Đã làm trên mẫu | Báo cáo trên test độc lập theo bốn lớp, đủ chỉ số và ma trận. |
| FR-10 · So sánh/chọn model | Đã làm | Chọn được model từ cùng tập đánh giá và truy lại lần train. |
| FR-11 · Tích hợp model | Đã làm ở demo | Kích hoạt bundle hợp lệ và dùng đúng model trên robot chính thức. |
| FR-12 · Suy luận theo chu kỳ | Đã làm ở demo | Runtime chạy bundle 9 feature / 4 nhãn trên robot chính thức. |
| FR-13 · Ánh xạ sang lệnh | Đã làm ở demo | Kiểm chứng cả bốn hành động trên robot chính thức, gồm `STOP`. |
| FR-14 · Vòng lặp tới đích/kết thúc | Một phần | Chứng minh reached trong bán kính goal và các nhánh kết thúc có lý do. |
| FR-15 · Lưu lượt thử | Đã làm ở demo | Kiểm chứng dữ liệu đích, thời gian, contact và quãng đường trong log chính thức. |
| FR-16 · So sánh điều hướng | Còn việc | Có bảng so sánh giữa model trên cùng kịch bản. |
| FR-17 · Giám sát và kết quả cuối | Đã làm ở demo | Kiểm chứng action, khoảng cách, trạng thái và lịch sử kết quả trên world chính thức. |

## 6. Checklist trước khi trình diễn và nộp

- [ ] **Hiển** chuẩn bị robot/world chính thức, kịch bản chạy và thao tác reset. Có một kịch bản demo tới đích và một kịch bản kiểm thử kết thúc có lý do.
- [ ] **Hoàng** chạy lại smoke test, kiểm thử lái tay bằng bàn phím, start/stop, mất telemetry, reached, collision/timeout, đổi tab và xem kết quả cuối.
- [ ] **Đạt** chạy lại luồng train từ dataset thật, xem 4 model, xuất CSV, truy vết mẫu sai, đổi bundle và xác nhận danh tính model trong log Operator.
- [ ] **Cả nhóm** lấy ít nhất một lượt demo đầy đủ và bộ kết quả so sánh nhiều lượt theo quy trình thống nhất. Lưu log, dữ liệu, manifest, bảng điểm và ảnh để báo cáo có thể đối chiếu.
- [ ] **Cả nhóm** thử cài/chạy theo README từ checkout sạch, đối chiếu lại FR-01–FR-17 và các trang 2–9 của mockup. Tick từng việc khi có bằng chứng trên phiên bản nộp.

Nguồn đối chiếu nằm cạnh repo trong workspace môn học. [Đặc tả dự án](../../docs/project_specification_submission.md) · [Mockup 9 trang](<../../docs/Navigation_Monitor_Mockup_EN 3.pdf>) · [Sơ đồ nhóm trên Zalo](<../../trao đổi zalo/6.png>) · [Phân công DS](<../../trao đổi zalo/7.png>).
