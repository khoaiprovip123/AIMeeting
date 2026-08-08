# 🎙️ AI Meeting Assistant (Trợ lý Họp AI)

> **Phần mềm Trợ lý Họp Thông minh** – Tích hợp gỡ băng giọng nói thời gian thực và phân tích biên bản tự động bới mô hình thế hệ mới Gemini thông qua ngôn ngữ thiết kế **Liquid Glass (Kính lỏng)** sang trọng, mượt mà.

Vietnamese version below / Tài liệu Tiếng Việt ở phần dưới.

---

## 🌟 Overview / Tổng quan

**AI Meeting Assistant** is a comprehensive, production-ready full-stack application designed to automate the entire lifecycle of meeting documentation. From voice recording ingestion and precise dual-language speaker-labeled transcription, to highly structured 6-category executive summaries, this application solves your task with maximum visual fidelity and rich functional tools.

Featuring a **Premium Glassmorphic Liquid Design (Giao diện Kính trong suốt)** styled with beautiful subtle mesh gradients, customizable layouts, responsive touch points, and offline-first robust behaviors.

---

## ⚡ Key Highlights & Features (Tính năng nổi bật)

### 1. 🎙️ High-Fidelity Audio Transcription (Gỡ băng chuẩn xác)
* Powered by Google's cutting-edge `gemini-3.5-flash` model, converting Vietnamese/English audio and video files up to **200 MB** into highly accurate text.
* **Speaker Identification & Timestamp Alignments**: AI automatically identifies separate conversation streams. Users can rename default speaker badges globally with a single click.
* **Audio Seek-to-Timestamp**: Click on any chronological timestamp to jump to that precise second in the integrated visual media player for instant corroboration.

### 2. 🔮 Premium Liquid Glass UI/UX (Giao diện Kính lỏng cao cấp)
* Crafted with a polished light-glass aesthetic implementing realistic inner shadows, heavy backdrop-blurs, glowing orbital backdrops, and active layout state changes.
* Responsive layouts optimizing screen estate gracefully on tiny phone screens as well as ultra-wide monitors.

### 3. 🔍 Dynamic Fullscreen Mode (Phóng to Toàn màn hình)
* Interactive **"Maximize View" (Phóng to)** controls transition heavy analyses into clean, immersive, full-screen modes, letting coordinators proofread transcripts and structured columns with maximal ergonomics.

### 4. 🗂️ 6-Dimensional AI Meeting Minutes (Cấu trúc biên bản 6 lớp)
Organized into highly granular, clean tabs:
1. **Overview & Objectives (Tổng quan & Mục tiêu)**: Dynamic lists of attendees, date-time met, core mission statement, and agenda.
2. **Discussion Summary (Tóm tắt thảo luận)**: Segmented details of argument paths and brainstorm contributions.
3. **Key Decisions (Các quyết định then chốt)**: Clean visual bullet list tracking alignment.
4. **Action Items Table (Bảng phân công nhiệm vụ)**: Detailed task logs including customizable **Priority levels (Cao/Trung bình/Thấp)**, structural owner badges, collaborators, exact deadlines, and context notes.
5. **Pending Items (Vấn đề tồn đọng)**: Unresolved loops saved for the next block.
6. **Notes & References (Ghi chú / Tài liệu đính kèm)**: Footnotes and extra attachments.

### 5. 🤝 Cloud Ecosystem & Collaboration Integrations (Kết nối đám mây)
* **Save to Google Drive**: Generate beautifully pre-styled Microsoft Word documents (.docx) and upload them directly to your personal Drive folders, displaying convenient shortcut redirect keys.
* **Gmail Assistant Drafts**: Click to create a fully formed draft email with your customized recipient details, containing structured formatted HTML bodies and ready-to-send configurations.
* **Cloud Sync History**: Secured with Google Firestore, meetings are saved automatically under your credential context, queryable by keyword topics, date ranges, or original configurations.
* **Consolidation (Merge Báo cáo)**: Group numerous audio inputs or successive meetings into single aggregated reports.

---

## 🛠️ Tech Stack (Hệ thống Công nghệ)

* **Frontend**: React 18 (TypeScript), Vite, Tailwind CSS, Motion (Framer Motion).
* **AI Engine**: `@google/genai` powered by `gemini-3.5-flash`.
* **Database & Auth**: Firebase Firestore & Firebase Authentication.
* **Utilities**: `docx` for custom document layouts, `xlsx` for database exports, and multi-lingual i18n support.

---

# 📖 HƯỚNG DẪN SỬ DỤNG CHI TIẾT (VIETNAMESE GUIDE)

## 📌 PHẦN 1: QUY TRÌNH HỢP NHẤT 4 BƯỚC CƠ BẢN

Để sử dụng ứng dụng đạt hiệu quả tốt nhất, bạn chỉ cần tuân thủ quy trình 4 bước đơn giản sau:

### **Bước 1: Tải tệp ghi âm hoặc video lên hệ thống**
1. Tại giao diện màn hình chính, bạn có thể **Kéo & Thả (Drag & Drop)** hoặc bấm nút **"Chọn tệp từ máy tính"** để tải lên tệp ghi âm/video cuộc họp của mình.
2. **Định dạng được hỗ trợ:** MP3, M4A, WAV, MP4, MOV,... (Dung lượng tối đa lên tới **200 MB** cho mỗi tệp).
3. **Mẹo nhỏ:** Đối với video, hệ thống sẽ tự động tách và xử lý kênh âm thanh ngầm mà không gây tốn tài nguyên tải lên của bạn.

### **Bước 2: Quá trình Gỡ băng (Transcription)**
1. Chọn ngôn ngữ cuộc họp tương ứng (Tiếng Việt hoặc Tiếng Anh).
2. Hãy nhấp chọn nút **"Bắt đầu Gỡ băng →"**. Hệ thống sẽ tự động xử lý và tách nhận diện từng người phát biểu theo mốc thời gian thực chính xác.
3. Nếu bạn tải hai hoặc nhiều tệp lên cùng lúc, hệ thống sẽ tự động bật chế độ **"Xử lý hàng loạt (Batch Processing)"** giúp bạn gỡ băng lần lượt từng file trong một hàng đợi tự động.

### **Bước 3: Hiệu chỉnh văn bản & Đặt gợi ý bối cảnh (Analysis Hint)**
*Đây là bước quan trọng nhất quyết định độ chuẩn xác của báo cáo cuối cùng.*
1. **Kiểm tra văn bản:** Giao diện **"Xem & Chỉnh sửa Nội dung"** sẽ hiện ra. Bạn có thể nhấn trực tiếp vào bất kỳ ô hội thoại nào để sửa lại các lỗi viết sai hoặc bổ sung nội dung.
2. **Tìm lại đoạn nói nhanh:** Bấm thẳng vào mốc thời gian (Timestamp) bên cạnh câu nói. Trình phát âm thanh tích hợp sẽ tự động nhảy đến đúng giây giây đó để bạn nghe lại chính xác.
3. **Sửa nhãn Tên người nói:** Nhấp vào huy hiệu người nói (Speaker) để chuyển từ tên mặc định như `Người nói 1`, `Người nói 2` thành tên thực tế của đồng nghiệp hoặc nhân sự tham dự (Ví dụ: `Anh Khoai`, `Chị Linh`).
4. **Cung cấp gợi ý (Analysis Hint):** Nhập các ghi chú định hướng ở phần chân trang, chẳng hạn như danh sách tên riêng dễ nhầm lẫn, thuật ngữ kỹ thuật, tên dự án, tên doanh nghiệp viết tắt,... Để AI làm căn cứ biên tập chuẩn xác báo cáo.

### **Bước 4: Xuất báo cáo AI & Chia sẻ**
1. Nhấn nút **"Lưu & Phân tích →"**. Trí tuệ nhân tạo sẽ chắt lọc văn bản thô vừa hiệu chỉnh và biến thành chuyên mục Biên bản cuộc họp chuẩn chỉnh.
2. Khám phá sâu báo cáo thông qua **6 thẻ danh mục** vô cùng tiện lợi.
3. Sử dụng các tính năng xuất khẩu ngay trên thanh công cụ để chia sẻ biên bản đến toàn nhóm.

---

## 🔍 PHẦN 2: CHI TIẾT CÁC THẺ BÁO CÁO CHUYÊN SÂU CỦA AI

Báo cáo cuộc họp tự động được cấu trúc thành một tiêu chuẩn khắt khe gồm 6 phần nội dung được phân bổ mượt mà:

1. **Tổng quan & Mục tiêu (Overview & Objectives):**
   * Định danh rõ ràng Chủ đề cuộc họp, thời gian, vị trí và liệt kê chi tiết các thành phần nhân sự tham gia.
   * Đồng thời làm rõ mục đích then chốt và mục tiêu cốt lõi mà cuộc họp hướng tới.
2. **Tóm tắt (Discussion Summary):**
   * Phân loại, xâu chuỗi và tóm tắt theo cấu trúc phân mục đối với tất cả các luồng thảo luận một cách mạch lạc nhất.
3. **Quyết định (Key Decisions):**
   * Tổng hợp cô đọng toàn bộ các quyết định lớn nhỏ đã được các thành viên dự họp chốt và đồng thuận cuối cùng, giúp loại bỏ sự mơ hồ.
4. **Nhiệm vụ (Action Items):**
   * Bảng phân vai hành động trực trực quan trực tiếp bao gồm các cột: *Nội dung công việc cụ thể*, *Mức độ ưu tiên*, *Người phụ trách (Owner)*, *Người phối hợp hỗ trợ*, *Thời hạn hoàn thành (Deadline)*, và *Ghi chú đi kèm*.
5. **Tồn đọng (Pending Items):**
   * Ghi nhận lưu vết những nhiệm vụ, khúc mắc chưa có hướng giải quyết cuối cùng hoặc cần dời lịch biểu sang cuộc họp kế tiếp để chuẩn bị kỹ càng hơn.
6. **Ghi chú & Tài liệu (Notes & References):**
   * Các thông tin bổ trợ như bối cảnh phụ của cuộc họp, đường dẫn tài liệu đính kèm hoặc các điểm lưu ý bên lề khác.

---

## ⚙️ Development Guide (Hướng dẫn phát triển cho Nhà phát triển)

### Prerequisites (Yêu cầu hệ thống)
* Node.js (Version 18 or higher)
* Npm or Yarn

### Installation & Initialization (Cài đặt)

1. **Clone repository và cài đặt các thư viện liên quan**:
   ```bash
   npm install
   ```

2. **Cấu hình biến môi trường** (Tạo tệp `.env` dựa trên file mẫu `.env.example`):
   ```env
   GEMINI_API_KEY=your_gemini_api_key
   ```

3. **Khởi chạy ứng dụng trong chế độ Development**:
   ```bash
   npm run dev
   ```
   Ứng dụng sẽ tự động chạy tại cổng `http://localhost:3000`.

4. **Biên dịch Dự án sản xuất (Build for Production)**:
   ```bash
   npm run build
   ```

---

## 🎨 Design Philosophy (Triết lý thiết kế)

Ứng dụng tuân thủ nghiêm ngặt trường phái tối giản hiện đại (Minimalism) kết hợp hiệu ứng **Glassmorphism (Kính mờ)**:
* **Micro-interaction**: Hiệu ứng chuyển động mượt mà bằng `framer-motion` cho từng tương tác rê chuột (hover), nhấn giữ và thay đổi trạng thái thẻ báo cáo.
* **Ergonomics**: Bố cục tương phản trực quan tốt, phân chia không gian âm (negative space) rộng rãi, màu sắc dịu nhẹ chống mỏi mắt cho người đọc văn bản dài.
* **Anti-AI-Slop**: Nói KHÔNG với các trang trí thừa thãi của hệ thống hoặc mã log thô để bảo toàn trải nghiệm tự nhiên và thanh lịch nhất cho người dùng.

---
*Bản quyền phát triển bởi Đội ngũ Trợ lý Họp AI.*
