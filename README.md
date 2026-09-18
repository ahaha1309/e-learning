# E-Learning LMS Scaffold 🚀

Một hệ thống quản lý học tập (Learning Management System - LMS) hoàn chỉnh, sẵn sàng cho môi trường production, được xây dựng trên nền tảng **Node.js, Express, MongoDB** và giao diện render từ phía server (Server-Rendered) với **Pug** & **TailwindCSS**.

Dự án này cung cấp nền tảng vững chắc bao gồm các tính năng cốt lõi của Module 1 và hệ thống xác thực (Authentication) của Module 2.

---

## 🌟 Tính Năng Nổi Bật

- **Kiến trúc Server-Rendered**: Tối ưu SEO và hiệu năng với Pug template engine.
- **Xác Thực Đa Kênh (Authentication)**:
  - Đăng nhập cục bộ (Email/Mật khẩu) với mã hóa `bcrypt`.
  - Đăng nhập mạng xã hội: Google & Facebook OAuth (thông qua `passport.js`).
  - Phân quyền bằng JWT (JSON Web Token) kết hợp Session.
- **Cơ Sở Dữ Liệu**: Sử dụng MongoDB qua `mongoose`, có cơ chế cache (`node-cache`) và sanitize.
- **Bảo Mật Tối Ưu**: Tích hợp `helmet`, `csurf`, `xss-clean`, `express-rate-limit`, `express-mongo-sanitize`.
- **Thiết Kế Mở Rộng**: Sẵn sàng tích hợp Hệ thống Thông tin Sinh viên (SIS), điểm chuẩn đầu ra (OBE), và Lưu trữ Đám mây (Cloud Object Storage) (Xem thêm tại [Thiết kế kỹ thuật](./thiet-ke-ky-thuat-elearning.md)).
- **Real-time**: Hỗ trợ giao tiếp thời gian thực với `socket.io`.
- **UI/UX**: Giao diện thiết kế linh hoạt, hiện đại kết hợp giữa `tailwindcss` và `bootstrap`.
- **Quản Lý File**: Hỗ trợ xử lý upload qua `multer` và `cloudinary`.

---

## 🛠 Công Nghệ Sử Dụng

- **Backend**: Node.js (>= 20), Express.js.
- **Database**: MongoDB (>= 7), Mongoose, Connect-Mongo.
- **Frontend**: Pug (Template Engine), Tailwind CSS (v3.4), Bootstrap.
- **Bảo mật & Auth**: Passport.js (Local, Google, Facebook, JWT), Bcrypt, Helmet, Csurf, Express-validator.
- **Testing**: Jest, Supertest.
- **Tiện ích khác**: Nodemailer (Gửi email), Json2csv, Morgan (Logging), Concurrently, Prettier.

---

## ⚙️ Yêu Cầu Môi Trường (Prerequisites)

Để chạy dự án, hệ thống của bạn cần cài đặt:
- **Node.js**: Phiên bản 20 trở lên.
- **MongoDB**: Phiên bản 7 trở lên (hoặc sử dụng MongoDB Atlas).
- **Docker & Docker Compose** (Tùy chọn nếu muốn chạy qua container).

---

## 🚀 Hướng Dẫn Cài Đặt (Setup)

### 1. Clone repository & Cài đặt thư viện
```bash
git clone <repository-url>
cd e-learning
npm install
```

### 2. Thiết lập Biến Môi Trường (Environment Variables)
Sao chép file `.env.example` (nếu có) thành `.env` và điền các thông số cần thiết:
```bash
cp .env.example .env
```
Các thông số quan trọng trong `.env` thường bao gồm:
- `MONGO_URL`: Đường dẫn kết nối CSDL MongoDB.
- `JWT_SECRET`, `SESSION_SECRET`: Các khóa bảo mật.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: Cho tính năng đăng nhập bằng Google.
- `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`: Cho tính năng đăng nhập bằng Facebook.
- `PORT`: Cổng chạy ứng dụng (Mặc định: 3000 hoặc tùy chọn).

### 3. Khởi tạo dữ liệu (Seeding) - Tùy chọn
Để tạo dữ liệu mẫu ban đầu (seeds):
```bash
npm run seed
```

### 4. Chạy Ứng Dụng
**Môi trường Phát triển (Development):**
Lệnh sau sẽ khởi chạy đồng thời server Node.js bằng Nodemon và trình biên dịch TailwindCSS (watch mode).
```bash
npm run start
```

**Môi trường Production:**
Bạn nên cấu hình chạy qua PM2 và proxy qua Nginx:
```bash
pm2 start ecosystem.config.js
```
*(Tham khảo cấu hình Nginx mẫu tại `nginx.example.conf`)*

---

## 📜 Các Lệnh Scripts Có Sẵn (NPM Scripts)

- `npm start`: Chạy dự án ở chế độ phát triển (bao gồm watch CSS qua tailwind và nodemon).
- `npm run build:css`: Biên dịch và minify file Tailwind CSS.
- `npm run watch:css`: Theo dõi và tự động biên dịch CSS khi có thay đổi.
- `npm run format`: Format lại toàn bộ code trong dự án bằng Prettier.
- `npm run check`: Kiểm tra cú pháp (Syntax check) file index.js.
- `npm run test`: Chạy bộ test với Jest.
- `npm run seed`: Chạy script tạo dữ liệu mẫu.

---

## 🐳 Docker

Dự án cung cấp sẵn file `docker-compose.yml` giúp khởi tạo môi trường một cách dễ dàng và nhanh chóng.
Để chạy MongoDB và ứng dụng shell qua Docker:
```bash
docker-compose up -d
```

---

## 🔐 Chi Tiết API Xác Thực (Authentication Routes)

Hệ thống cung cấp sẵn các endpoint cho quá trình xác thực và ủy quyền:

- **Đăng ký / Đăng nhập cơ bản:**
  - `GET /auth/register` & `POST /auth/register`
  - `GET /auth/login` & `POST /auth/login`
  - `POST /auth/logout`
- **Quản lý phiên (Session/Token):**
  - `POST /auth/refresh`: Làm mới token (JWT).
  - `GET /auth/me`: Lấy thông tin người dùng hiện tại đang đăng nhập.
- **Đăng nhập Mạng Xã Hội:**
  - `GET /auth/google` & `GET /auth/google/callback`
  - `GET /auth/facebook` & `GET /auth/facebook/callback`

---

## 📁 Cấu Trúc Thư Mục (Project Structure)

```text
e-learning/
├── api/             # RESTful API endpoints
├── config/          # Cấu hình hệ thống (Database, Passport, v.v.)
├── controller/      # Logic điều khiển, xử lý request/response
├── helper/          # Các hàm hỗ trợ / format dữ liệu
├── middleware/      # Express middlewares (Auth, Error handler, Upload)
├── models/          # Schema MongoDB định nghĩa bởi Mongoose
├── public/          # Chứa các tài nguyên tĩnh (CSS, JS, Images)
├── routes/          # Khai báo và định tuyến các đường dẫn của ứng dụng
├── scripts/         # Các script tiện ích (vd: seed dữ liệu)
├── services/        # Các service tương tác với cơ sở dữ liệu hoặc bên thứ 3
├── template/        # (Các template email / xuất file nếu có)
├── tests/           # Thư mục chứa các Unit Test và Integration Test
├── utils/           # Các lớp và hàm tiện ích lõi (AppError, v.v.)
├── validate/        # Logic kiểm tra/xác thực dữ liệu đầu vào (Validation)
└── views/           # Các template giao diện Pug (.pug)
```

---

## 🔮 Định Hướng Phát Triển (Roadmap & Technical Design)

Dự án được thiết kế chuẩn mực và sẵn sàng cho việc mở rộng ở cấp độ doanh nghiệp (Enterprise-level):
1. **Tích hợp SIS (Student Information System)**: Đồng bộ danh sách sinh viên, đăng ký môn học và lớp học theo cả 2 hướng Batch Sync và Event-Driven.
2. **Hệ thống Đánh giá Chuẩn Đầu Ra (OBE - Outcome-Based Education)**: Đánh giá sinh viên dựa trên ma trận CLO - PLO từ từng câu hỏi thay vì chỉ điểm bài thi.
3. **Lưu trữ Cloud (Object Storage)**: Tích hợp AWS S3/GCS thông qua Presigned URL để sinh viên upload trực tiếp video bài giảng hoặc bài nộp nặng, giảm tải cho server.

> Xem chi tiết kiến trúc và thiết kế hệ thống tại: **[Thiết kế kỹ thuật mở rộng](./thiet-ke-ky-thuat-elearning.md)**.
