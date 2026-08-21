/**
 * seeds/seed-net201.js
 *
 * Seed dữ liệu phong phú cho lớp "Mạng Máy Tính" (NET201)
 * của giáo viên givien.9@elearning.com
 *
 * Chạy: node seeds/seed-net201.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// ─── Models ───────────────────────────────────────────────────────────────────
const User             = require('../models/User');
const Classroom        = require('../models/Classroom');
const ClassroomMember  = require('../models/ClassroomMember');
const Lecture          = require('../models/Lecture');
const Assignment       = require('../models/Assignment');
const Submission       = require('../models/Submission');
const Exam             = require('../models/Exam');
const Question         = require('../models/Question');
const ExamSubmission   = require('../models/ExamSubmission');
const StudentProgress  = require('../models/StudentProgress');
const AttendanceSession= require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const DiscussionTopic  = require('../models/DiscussionTopic');
const DiscussionReply  = require('../models/DiscussionReply');
const ChatMessage      = require('../models/ChatMessage');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔗 Kết nối MongoDB...');
  await mongoose.connect(process.env.MONGO_URL);
  console.log('✅ Đã kết nối!\n');

  // ── 1. Tìm giáo viên ─────────────────────────────────────────────────────
  let teacher = await User.findOne({ email: 'givien.9@elearning.com' });
  if (!teacher) {
    console.log('⚠️  Không tìm thấy giáo viên givien.9@elearning.com, tạo mới...');
    teacher = new User({
      name: 'Đỗ Nhật Khanh',
      email: 'givien.9@elearning.com',
      role: 'teacher',
      status: 'active',
    });
    await teacher.setPassword('123456');
    await teacher.save();
    console.log('   → Tạo giáo viên thành công');
  } else {
    console.log(`✅ Tìm thấy giáo viên: ${teacher.name}`);
  }

  // ── 2. Tìm/Tạo classroom NET201 ──────────────────────────────────────────
  let classroom = await Classroom.findOne({ code: 'NET201' });
  if (!classroom) {
    classroom = await Classroom.create({
      name: 'Mạng Máy Tính',
      description: 'Môn học cung cấp kiến thức nền tảng về mạng máy tính: mô hình OSI, TCP/IP, giao thức mạng, địa chỉ IP, định tuyến và bảo mật mạng.',
      teacher: teacher._id,
      code: 'NET201',
      level: 'Intermediate',
      approvalRequired: false,
      gradeWeights: [
        { itemType: 'ASSIGNMENT', weight: 3 },
        { itemType: 'EXAM', weight: 7 },
      ],
    });
    console.log('✅ Tạo classroom NET201');
  } else {
    console.log(`✅ Tìm thấy classroom: ${classroom.name} (${classroom.code})`);
  }

  // ── 3. Tạo/Tìm học sinh ───────────────────────────────────────────────────
  const studentData = [
    { name: 'Lê Quang Hải',      email: 'hocsinh.1@elearning.vn' },
    { name: 'Phạm Quỳnh Anh',    email: 'hocsinh.2@elearning.vn' },
    { name: 'Nguyễn Thành Đạt',  email: 'hocsinh.3@elearning.vn' },
    { name: 'Hoàng Minh Tuấn',   email: 'hocsinh.4@elearning.vn' },
    { name: 'Trần Thị Mai',      email: 'hocsinh.5@elearning.vn' },
    { name: 'Vũ Đức Trọng',      email: 'hocsinh.6@elearning.vn' },
    { name: 'Bùi Thị Hoa',       email: 'hocsinh.7@elearning.vn' },
    { name: 'Đặng Văn Long',     email: 'hocsinh.8@elearning.vn' },
    { name: 'Ngô Thị Lan',       email: 'hocsinh.9@elearning.vn' },
    { name: 'Hồ Quang Hiếu',     email: 'hocsinh.10@elearning.vn' },
    { name: 'Đinh Thị Nhung',    email: 'hocsinh.22@elearning.vn' },
    { name: 'Hà Minh Quân',      email: 'hocsinh.11@elearning.vn' },
  ];

  const students = [];
  for (const sd of studentData) {
    let s = await User.findOne({ email: sd.email });
    if (!s) {
      s = new User({ name: sd.name, email: sd.email, role: 'student', status: 'active' });
      await s.setPassword('123456');
      await s.save();
    }
    students.push(s);
  }
  console.log(`✅ ${students.length} học sinh sẵn sàng`);

  // ── 4. Enroll học sinh vào lớp ────────────────────────────────────────────
  for (const s of students) {
    await ClassroomMember.findOneAndUpdate(
      { classroom: classroom._id, student: s._id },
      { classroom: classroom._id, student: s._id, status: 'approved' },
      { upsert: true, new: true }
    );
  }
  console.log('✅ Đã enroll tất cả học sinh');

  // ── 5. Bài giảng (Lectures) ───────────────────────────────────────────────
  const lectureData = [
    // Chương 1: Tổng quan mạng máy tính
    {
      chapterTitle: 'Chương 1: Tổng quan mạng máy tính',
      title: 'Giới thiệu về mạng máy tính',
      summary: 'Lịch sử hình thành và phát triển của mạng máy tính. Tầm quan trọng trong kỷ nguyên số.',
      content: `<h2>1. Mạng máy tính là gì?</h2>
<p>Mạng máy tính là tập hợp các thiết bị tính toán (máy tính, điện thoại, máy chủ...) được kết nối với nhau thông qua phương tiện truyền dẫn (cáp đồng, cáp quang, sóng vô tuyến...) để chia sẻ tài nguyên và thông tin.</p>

<h2>2. Lịch sử phát triển</h2>
<ul>
  <li><strong>1969:</strong> ARPANET ra đời - mạng máy tính đầu tiên của thế giới</li>
  <li><strong>1983:</strong> TCP/IP trở thành giao thức chuẩn</li>
  <li><strong>1991:</strong> World Wide Web (WWW) được phát minh bởi Tim Berners-Lee</li>
  <li><strong>2000s-nay:</strong> Kỷ nguyên Internet tốc độ cao, mạng 4G/5G, IoT</li>
</ul>

<h2>3. Các loại mạng phổ biến</h2>
<p><strong>LAN (Local Area Network):</strong> Mạng cục bộ, phạm vi nhỏ (văn phòng, trường học)</p>
<p><strong>WAN (Wide Area Network):</strong> Mạng diện rộng, kết nối nhiều khu vực địa lý</p>
<p><strong>MAN (Metropolitan Area Network):</strong> Mạng đô thị, phạm vi một thành phố</p>
<p><strong>Internet:</strong> Mạng toàn cầu lớn nhất</p>

<h2>4. Lợi ích của mạng máy tính</h2>
<ul>
  <li>Chia sẻ tài nguyên (máy in, tệp tin, ứng dụng)</li>
  <li>Truyền thông và cộng tác từ xa</li>
  <li>Tiết kiệm chi phí phần cứng</li>
  <li>Tập trung hóa quản lý dữ liệu</li>
</ul>`,
      resourceType: 'text',
      orderIndex: 0,
      isPublished: true,
    },
    {
      chapterTitle: 'Chương 1: Tổng quan mạng máy tính',
      title: 'Các mô hình mạng OSI và TCP/IP',
      summary: 'Phân tích chi tiết 7 tầng OSI và 4 tầng TCP/IP. So sánh và ánh xạ giữa hai mô hình.',
      content: `<h2>Mô hình OSI (Open Systems Interconnection)</h2>
<p>Mô hình OSI được ISO ban hành năm 1984, gồm 7 tầng:</p>

<table border="1" style="border-collapse:collapse; width:100%">
  <tr><th>Tầng</th><th>Tên</th><th>Chức năng</th><th>Giao thức ví dụ</th></tr>
  <tr><td>7</td><td>Application (Ứng dụng)</td><td>Giao tiếp với ứng dụng người dùng</td><td>HTTP, FTP, SMTP, DNS</td></tr>
  <tr><td>6</td><td>Presentation (Trình bày)</td><td>Mã hóa, nén dữ liệu</td><td>SSL/TLS, JPEG, MPEG</td></tr>
  <tr><td>5</td><td>Session (Phiên)</td><td>Quản lý phiên kết nối</td><td>NetBIOS, RPC</td></tr>
  <tr><td>4</td><td>Transport (Vận chuyển)</td><td>Truyền tải tin cậy đầu-cuối</td><td>TCP, UDP</td></tr>
  <tr><td>3</td><td>Network (Mạng)</td><td>Định tuyến gói tin</td><td>IP, ICMP, OSPF</td></tr>
  <tr><td>2</td><td>Data Link (Liên kết dữ liệu)</td><td>Framing, điều khiển lỗi</td><td>Ethernet, PPP, Wi-Fi</td></tr>
  <tr><td>1</td><td>Physical (Vật lý)</td><td>Truyền bit qua phương tiện</td><td>Cáp, Hub, Repeater</td></tr>
</table>

<h2>Mô hình TCP/IP</h2>
<p>Mô hình TCP/IP thực tế hơn, gồm 4 tầng:</p>
<ul>
  <li><strong>Application:</strong> Tương ứng tầng 5-7 của OSI</li>
  <li><strong>Transport:</strong> Tương ứng tầng 4 của OSI</li>
  <li><strong>Internet:</strong> Tương ứng tầng 3 của OSI</li>
  <li><strong>Network Access:</strong> Tương ứng tầng 1-2 của OSI</li>
</ul>`,
      resourceType: 'text',
      orderIndex: 1,
      isPublished: true,
    },
    // Chương 2: Địa chỉ IP và Subnetting
    {
      chapterTitle: 'Chương 2: Địa chỉ IP và Subnetting',
      title: 'Địa chỉ IPv4 - Cơ bản và phân lớp',
      summary: 'Cấu trúc địa chỉ IPv4, các lớp mạng A/B/C/D/E và địa chỉ đặc biệt.',
      content: `<h2>Địa chỉ IPv4</h2>
<p>IPv4 sử dụng địa chỉ 32-bit, viết dưới dạng 4 octet thập phân phân cách bởi dấu chấm.</p>
<p>Ví dụ: <code>192.168.1.1</code> = <code>11000000.10101000.00000001.00000001</code></p>

<h2>Phân lớp địa chỉ IP</h2>
<table border="1" style="border-collapse:collapse; width:100%">
  <tr><th>Lớp</th><th>Dải địa chỉ</th><th>Subnet mặc định</th><th>Số mạng</th><th>Số host/mạng</th></tr>
  <tr><td>A</td><td>1.0.0.0 – 126.255.255.255</td><td>255.0.0.0 (/8)</td><td>126</td><td>16.777.214</td></tr>
  <tr><td>B</td><td>128.0.0.0 – 191.255.255.255</td><td>255.255.0.0 (/16)</td><td>16.384</td><td>65.534</td></tr>
  <tr><td>C</td><td>192.0.0.0 – 223.255.255.255</td><td>255.255.255.0 (/24)</td><td>2.097.152</td><td>254</td></tr>
  <tr><td>D</td><td>224.0.0.0 – 239.255.255.255</td><td>—</td><td colspan="2">Multicast</td></tr>
  <tr><td>E</td><td>240.0.0.0 – 255.255.255.255</td><td>—</td><td colspan="2">Nghiên cứu</td></tr>
</table>

<h2>Địa chỉ IP đặc biệt</h2>
<ul>
  <li><strong>Loopback:</strong> 127.0.0.1 (kiểm tra card mạng nội bộ)</li>
  <li><strong>Private:</strong> 10.x.x.x | 172.16-31.x.x | 192.168.x.x</li>
  <li><strong>Broadcast:</strong> 255.255.255.255 (toàn mạng)</li>
  <li><strong>APIPA:</strong> 169.254.x.x (tự gán khi không có DHCP)</li>
</ul>`,
      resourceType: 'text',
      orderIndex: 0,
      isPublished: true,
    },
    {
      chapterTitle: 'Chương 2: Địa chỉ IP và Subnetting',
      title: 'Chia mạng con (Subnetting) và CIDR',
      summary: 'Kỹ thuật chia subnet, tính toán số host, địa chỉ mạng và broadcast. Notation CIDR /prefix.',
      content: `<h2>Tại sao cần Subnetting?</h2>
<p>Subnetting giúp:</p>
<ul>
  <li>Tối ưu sử dụng không gian địa chỉ IP</li>
  <li>Giảm broadcast traffic</li>
  <li>Tăng bảo mật bằng cách phân vùng mạng</li>
  <li>Dễ quản lý hơn</li>
</ul>

<h2>Ký hiệu CIDR</h2>
<p>CIDR (Classless Inter-Domain Routing) dùng ký hiệu /prefix:</p>
<p><code>192.168.10.0/24</code> → Subnet mask: 255.255.255.0 → 254 host</p>
<p><code>10.0.0.0/8</code> → Subnet mask: 255.0.0.0 → ~16 triệu host</p>

<h2>Công thức tính Subnetting</h2>
<ul>
  <li><strong>Số subnet:</strong> 2<sup>n</sup> (n = số bit mượn từ phần host)</li>
  <li><strong>Số host/subnet:</strong> 2<sup>h</sup> - 2 (h = số bit còn lại cho host)</li>
  <li><strong>Network address:</strong> Bit host = 0</li>
  <li><strong>Broadcast:</strong> Bit host = 1</li>
</ul>

<h2>Ví dụ thực hành</h2>
<p>Chia mạng <code>192.168.1.0/24</code> thành 4 subnet:</p>
<table border="1" style="border-collapse:collapse; width:100%">
  <tr><th>Subnet</th><th>Network</th><th>Host range</th><th>Broadcast</th></tr>
  <tr><td>1</td><td>192.168.1.0/26</td><td>.1 – .62</td><td>192.168.1.63</td></tr>
  <tr><td>2</td><td>192.168.1.64/26</td><td>.65 – .126</td><td>192.168.1.127</td></tr>
  <tr><td>3</td><td>192.168.1.128/26</td><td>.129 – .190</td><td>192.168.1.191</td></tr>
  <tr><td>4</td><td>192.168.1.192/26</td><td>.193 – .254</td><td>192.168.1.255</td></tr>
</table>`,
      resourceType: 'text',
      orderIndex: 1,
      isPublished: true,
    },
    // Chương 3: Giao thức mạng
    {
      chapterTitle: 'Chương 3: Giao thức và dịch vụ mạng',
      title: 'Giao thức TCP và UDP',
      summary: 'So sánh TCP và UDP: kết nối, độ tin cậy, tốc độ. Bắt tay 3 bước TCP. Ứng dụng thực tế.',
      content: `<h2>TCP (Transmission Control Protocol)</h2>
<p>TCP là giao thức truyền tải hướng kết nối, đảm bảo độ tin cậy:</p>

<h3>Quá trình bắt tay 3 bước (Three-way Handshake)</h3>
<ol>
  <li><strong>SYN:</strong> Client gửi gói SYN tới server</li>
  <li><strong>SYN-ACK:</strong> Server phản hồi SYN-ACK</li>
  <li><strong>ACK:</strong> Client xác nhận bằng ACK → Kết nối thiết lập</li>
</ol>

<h3>Đặc điểm TCP</h3>
<ul>
  <li>✅ Đảm bảo thứ tự gói tin</li>
  <li>✅ Kiểm soát lỗi và truyền lại</li>
  <li>✅ Kiểm soát luồng (Flow Control)</li>
  <li>❌ Overhead cao hơn UDP</li>
</ul>
<p><strong>Dùng cho:</strong> HTTP/S, FTP, SMTP, SSH</p>

<h2>UDP (User Datagram Protocol)</h2>
<p>UDP là giao thức không kết nối, không đảm bảo thứ tự:</p>
<h3>Đặc điểm UDP</h3>
<ul>
  <li>✅ Tốc độ cao, độ trễ thấp</li>
  <li>✅ Overhead thấp (header 8 byte vs TCP 20 byte)</li>
  <li>❌ Không đảm bảo giao hàng</li>
  <li>❌ Không kiểm soát lỗi</li>
</ul>
<p><strong>Dùng cho:</strong> DNS, DHCP, Video streaming, VoIP, Online gaming</p>

<h2>Bảng so sánh TCP vs UDP</h2>
<table border="1" style="border-collapse:collapse; width:100%">
  <tr><th>Tiêu chí</th><th>TCP</th><th>UDP</th></tr>
  <tr><td>Kết nối</td><td>Có (Connection-oriented)</td><td>Không (Connectionless)</td></tr>
  <tr><td>Độ tin cậy</td><td>Cao</td><td>Thấp</td></tr>
  <tr><td>Tốc độ</td><td>Chậm hơn</td><td>Nhanh hơn</td></tr>
  <tr><td>Header</td><td>20-60 bytes</td><td>8 bytes</td></tr>
  <tr><td>Thứ tự</td><td>Đảm bảo</td><td>Không đảm bảo</td></tr>
</table>`,
      resourceType: 'text',
      orderIndex: 0,
      isPublished: true,
    },
    {
      chapterTitle: 'Chương 3: Giao thức và dịch vụ mạng',
      title: 'DNS, DHCP và HTTP/HTTPS',
      summary: 'Nguyên lý hoạt động của DNS, DHCP và HTTP. Sự khác biệt HTTP vs HTTPS, TLS handshake.',
      content: `<h2>DNS (Domain Name System)</h2>
<p>DNS chuyển đổi tên miền → địa chỉ IP:</p>
<p>Ví dụ: <code>google.com</code> → <code>142.250.185.46</code></p>

<h3>Quy trình phân giải DNS</h3>
<ol>
  <li>Client hỏi DNS Resolver (thường là của ISP)</li>
  <li>Resolver hỏi Root DNS Server</li>
  <li>Root trả lời địa chỉ TLD Server (.com, .vn...)</li>
  <li>TLD trả lời địa chỉ Authoritative DNS</li>
  <li>Authoritative trả IP cuối cùng</li>
</ol>

<h2>DHCP (Dynamic Host Configuration Protocol)</h2>
<p>DHCP tự động cấp phát địa chỉ IP cho thiết bị:</p>
<p><strong>Quá trình DORA:</strong></p>
<ol>
  <li><strong>Discover:</strong> Client broadcast tìm DHCP server</li>
  <li><strong>Offer:</strong> Server đề xuất địa chỉ IP</li>
  <li><strong>Request:</strong> Client chấp nhận IP đề xuất</li>
  <li><strong>Acknowledge:</strong> Server xác nhận và cấp phát</li>
</ol>

<h2>HTTP và HTTPS</h2>
<p><strong>HTTP (HyperText Transfer Protocol):</strong></p>
<ul>
  <li>Port 80, giao tiếp văn bản thuần</li>
  <li>Không mã hóa → dễ bị nghe trộm (Man-in-the-Middle)</li>
</ul>
<p><strong>HTTPS = HTTP + TLS/SSL:</strong></p>
<ul>
  <li>Port 443, mã hóa toàn bộ traffic</li>
  <li>Xác thực server qua Certificate Authority (CA)</li>
  <li>Bảo vệ dữ liệu người dùng (mật khẩu, thông tin thẻ...)</li>
</ul>`,
      resourceType: 'text',
      orderIndex: 1,
      isPublished: true,
    },
    // Chương 4: Bảo mật mạng
    {
      chapterTitle: 'Chương 4: Bảo mật mạng',
      title: 'Tổng quan bảo mật mạng và các mối đe dọa',
      summary: 'Các loại tấn công mạng phổ biến: DoS, DDoS, Man-in-the-Middle, Phishing, SQL Injection.',
      content: `<h2>Tầm quan trọng của bảo mật mạng</h2>
<p>Trong thời đại số, bảo mật mạng là yếu tố sống còn của mọi tổ chức. Một cuộc tấn công thành công có thể gây thiệt hại hàng triệu đô la và mất uy tín.</p>

<h2>Các mối đe dọa bảo mật phổ biến</h2>

<h3>1. DoS/DDoS Attack</h3>
<p><strong>DoS (Denial of Service):</strong> Một nguồn tấn công làm tê liệt dịch vụ</p>
<p><strong>DDoS (Distributed DoS):</strong> Nhiều nguồn (botnet) tấn công đồng thời</p>
<p>→ Biện pháp: Rate limiting, Load balancer, CDN, Firewall quy tắc</p>

<h3>2. Man-in-the-Middle (MITM)</h3>
<p>Kẻ tấn công chèn vào giữa hai bên giao tiếp để nghe trộm hoặc giả mạo.</p>
<p>→ Biện pháp: HTTPS, VPN, Certificate Pinning</p>

<h3>3. Phishing</h3>
<p>Giả mạo website/email hợp pháp để đánh cắp thông tin xác thực.</p>
<p>→ Biện pháp: Đào tạo người dùng, 2FA, Anti-phishing filters</p>

<h3>4. SQL Injection</h3>
<p>Chèn mã SQL độc hại vào input để truy cập trái phép database.</p>
<p>→ Biện pháp: Prepared statements, ORM, WAF</p>

<h3>5. Ransomware</h3>
<p>Mã độc mã hóa dữ liệu và đòi tiền chuộc.</p>
<p>→ Biện pháp: Backup thường xuyên, Endpoint protection, Patch management</p>

<h2>Tam giác bảo mật CIA</h2>
<ul>
  <li><strong>Confidentiality (Bí mật):</strong> Chỉ người có thẩm quyền mới xem được</li>
  <li><strong>Integrity (Toàn vẹn):</strong> Dữ liệu không bị sửa đổi trái phép</li>
  <li><strong>Availability (Khả dụng):</strong> Dịch vụ luôn sẵn sàng cho người dùng hợp lệ</li>
</ul>`,
      resourceType: 'text',
      orderIndex: 0,
      isPublished: true,
    },
    {
      chapterTitle: 'Chương 4: Bảo mật mạng',
      title: 'Firewall, VPN và mã hóa',
      summary: 'Cách hoạt động của Firewall, các loại VPN, thuật toán mã hóa AES, RSA và ứng dụng.',
      content: `<h2>Firewall</h2>
<p>Firewall là hàng rào bảo vệ giữa mạng nội bộ và bên ngoài, kiểm soát traffic theo quy tắc.</p>

<h3>Các loại Firewall</h3>
<ul>
  <li><strong>Packet Filter:</strong> Kiểm tra header IP/TCP (IP nguồn, đích, port)</li>
  <li><strong>Stateful Inspection:</strong> Theo dõi trạng thái kết nối</li>
  <li><strong>Application Layer (WAF):</strong> Phân tích nội dung ứng dụng (HTTP, SQL...)</li>
  <li><strong>Next-Gen Firewall (NGFW):</strong> Kết hợp IPS, DPI, SSL inspection</li>
</ul>

<h2>VPN (Virtual Private Network)</h2>
<p>VPN tạo đường hầm mã hóa qua Internet công cộng:</p>
<h3>Loại VPN phổ biến</h3>
<ul>
  <li><strong>Site-to-Site VPN:</strong> Kết nối hai văn phòng</li>
  <li><strong>Remote Access VPN:</strong> Nhân viên làm việc từ xa</li>
  <li><strong>SSL/TLS VPN:</strong> Qua trình duyệt web</li>
</ul>
<p><strong>Giao thức VPN:</strong> OpenVPN, IPSec/IKEv2, WireGuard, L2TP</p>

<h2>Mã hóa (Encryption)</h2>
<h3>Mã hóa đối xứng (Symmetric)</h3>
<p>Cùng một khóa để mã hóa và giải mã:</p>
<ul>
  <li><strong>AES-128/256:</strong> Chuẩn hiện đại, được dùng rộng rãi</li>
  <li><strong>3DES:</strong> Cũ hơn, chậm hơn AES</li>
</ul>

<h3>Mã hóa bất đối xứng (Asymmetric)</h3>
<p>Public key để mã hóa, Private key để giải mã:</p>
<ul>
  <li><strong>RSA-2048/4096:</strong> Trao đổi khóa, chữ ký số</li>
  <li><strong>ECC:</strong> Hiệu quả hơn RSA với cùng mức bảo mật</li>
</ul>`,
      resourceType: 'text',
      orderIndex: 1,
      isPublished: true,
    },
  ];

  const lectures = [];
  for (const ld of lectureData) {
    let lec = await Lecture.findOne({ classroom: classroom._id, title: ld.title });
    if (!lec) {
      lec = await Lecture.create({ ...ld, classroom: classroom._id, teacher: teacher._id });
    }
    lectures.push(lec);
  }
  console.log(`✅ ${lectures.length} bài giảng đã tạo`);

  // ── 6. Bài tập (Assignments) ─────────────────────────────────────────────
  const assignmentData = [
    {
      title: 'Bài tập 1: Phân tích mô hình OSI',
      description: 'Nghiên cứu và phân tích vai trò của từng tầng trong mô hình OSI khi truyền một email.',
      instructions: `<p>Hãy phân tích quá trình gửi một email từ máy A đến máy B qua Internet theo từng tầng của mô hình OSI:</p>
<ol>
  <li>Mô tả chức năng của mỗi tầng trong quá trình này</li>
  <li>Xác định giao thức hoạt động ở mỗi tầng</li>
  <li>Vẽ sơ đồ luồng dữ liệu đi qua các tầng</li>
  <li>Nêu ít nhất 2 vấn đề có thể xảy ra ở mỗi tầng</li>
</ol>
<p><strong>Yêu cầu:</strong> Nộp file PDF hoặc Word, tối thiểu 2 trang A4.</p>`,
      totalPoints: 10,
      dueDate: daysAgo(20),
      isPublished: true,
    },
    {
      title: 'Bài tập 2: Thực hành Subnetting',
      description: 'Tính toán địa chỉ mạng, subnet mask, host range và broadcast cho 5 bài toán subnetting.',
      instructions: `<p>Giải 5 bài toán subnetting sau:</p>
<ol>
  <li>Chia mạng <code>172.16.0.0/16</code> thành 16 subnet đều nhau. Tính network address, broadcast, host range của subnet thứ 5.</li>
  <li>Công ty cần 3 phòng ban: IT (50 host), Sale (100 host), Marketing (25 host). Thiết kế subnet từ <code>192.168.10.0/24</code>.</li>
  <li>Một ISP được cấp block <code>203.0.113.0/24</code>, cần chia cho 8 khách hàng mỗi người cần 28 host.</li>
  <li>Xác định địa chỉ <code>10.10.5.200/21</code> thuộc subnet nào, network address và broadcast là gì?</li>
  <li>Tổng hợp (summarize) các mạng: 192.168.1.0/26, 192.168.1.64/26, 192.168.1.128/26, 192.168.1.192/26 thành 1 route.</li>
</ol>`,
      totalPoints: 10,
      dueDate: daysAgo(7),
      isPublished: true,
    },
    {
      title: 'Bài tập 3: Phân tích gói tin Wireshark',
      description: 'Sử dụng Wireshark bắt gói tin và phân tích TCP three-way handshake, DNS query và HTTP request.',
      instructions: `<p>Sử dụng Wireshark để thực hiện:</p>
<ol>
  <li><strong>Bắt TCP handshake:</strong> Mở trình duyệt, vào một website HTTP. Chụp màn hình và annotate 3 gói SYN, SYN-ACK, ACK.</li>
  <li><strong>Phân tích DNS:</strong> Bắt gói tin khi ping google.com. Chỉ ra DNS Query và Response, TTL là bao nhiêu?</li>
  <li><strong>HTTP Request:</strong> Truy cập trang HTTP (không HTTPS). Tìm username/password nếu có form đăng nhập. Rút ra bài học gì?</li>
  <li><strong>Báo cáo:</strong> Nộp file .pcap kèm báo cáo phân tích.</li>
</ol>`,
      totalPoints: 10,
      dueDate: daysFromNow(7),
      isPublished: true,
    },
  ];

  const assignments = [];
  for (const ad of assignmentData) {
    let asgn = await Assignment.findOne({ classroom: classroom._id, title: ad.title });
    if (!asgn) {
      asgn = await Assignment.create({ ...ad, classroom: classroom._id, teacher: teacher._id });
    }
    assignments.push(asgn);
  }
  console.log(`✅ ${assignments.length} bài tập đã tạo`);

  // ── 7. Nộp bài (Submissions) ─────────────────────────────────────────────
  const submissionTexts = [
    'Theo mô hình OSI, quá trình gửi email trải qua 7 tầng. Ở tầng Application (7), giao thức SMTP đóng gói email. Tầng Presentation (6) mã hóa nội dung nếu dùng TLS. Tầng Session (5) duy trì phiên SMTP. Tầng Transport (4) TCP đảm bảo giao hàng tin cậy, chia thành segment. Tầng Network (3) IP định tuyến qua các router. Tầng Data Link (2) Ethernet đóng gói thành frame. Tầng Physical (1) chuyển thành tín hiệu điện/quang để truyền.',
    'Bài 1: 172.16.32.0/20, broadcast 172.16.47.255, hosts 172.16.32.1-172.16.47.254. Bài 2: IT subnet 192.168.10.128/26, Sale 192.168.10.0/25, Marketing 192.168.10.160/27. Bài 3: 8 subnets /27 từ 203.0.113.0, mỗi subnet 30 host usable. Bài 4: 10.10.0.0/21, broadcast 10.10.7.255. Bài 5: 192.168.1.0/24.',
    'Đã dùng Wireshark bắt gói tin thành công. TCP handshake bao gồm: Frame 1 SYN từ 192.168.1.100:54321 đến 93.184.216.34:80 với Seq=0. Frame 2 SYN-ACK server phản hồi Seq=0 Ack=1. Frame 3 ACK client xác nhận. DNS query gói tin loại A record, TTL=300 giây. Phần HTTP tôi phát hiện form login gửi plaintext password - đây là lý do HTTPS quan trọng!',
  ];

  const scoreDistribution = [
    [8.5, 9.0, null],
    [7.0, 8.0, null],
    [9.5, 9.5, null],
    [6.5, 7.5, null],
    [8.0, 8.5, null],
    [7.5, 9.0, null],
    [6.0, 7.0, null],
    [9.0, 8.0, null],
    [8.5, 9.5, null],
    [7.0, 8.5, null],
    [6.5, 7.0, null],
    [8.0, 8.0, null],
  ];

  const teacherComments = [
    'Phân tích tốt, nắm vững khái niệm từng tầng. Cần bổ sung thêm ví dụ thực tế.',
    'Bài làm đạt yêu cầu. Phần vẽ sơ đồ cần rõ ràng hơn.',
    'Xuất sắc! Phân tích sâu sắc và có ví dụ minh họa rất tốt.',
    'Còn sai ở bài 3. Xem lại cách tính usable host range.',
    'Tốt! Kết quả chính xác. Trình bày sạch sẽ.',
    'Bài làm khá, nhưng bài 5 còn thiếu prefix length.',
    'Cần nộp file .pcap. Báo cáo viết tốt nhưng thiếu screenshot.',
    'Rất tốt! Phân tích HTTP plaintext rất sâu sắc.',
    null,
    null,
    null,
    null,
  ];

  for (let si = 0; si < students.length; si++) {
    const student = students[si];
    const scores = scoreDistribution[si];
    for (let ai = 0; ai < assignments.length; ai++) {
      const assignment = assignments[ai];
      const score = scores[ai];
      if (score === null) continue; // chưa nộp bài tập thứ 3

      const existingSub = await Submission.findOne({ assignment: assignment._id, student: student._id });
      if (!existingSub) {
        const sub = await Submission.create({
          assignment: assignment._id,
          classroom: classroom._id,
          teacher: teacher._id,
          student: student._id,
          textAnswer: submissionTexts[ai] || 'Bài làm đã hoàn thành.',
          status: 'graded',
          submittedAt: daysAgo(rand(1, 5)),
          score,
          teacherComment: teacherComments[si * assignments.length + ai] || 'Bài làm đạt yêu cầu.',
          gradedAt: daysAgo(rand(1, 3)),
        });

        // Ghi progress
        await StudentProgress.findOneAndUpdate(
          { student: student._id, classroom: classroom._id, itemType: 'ASSIGNMENT', itemId: assignment._id },
          { student: student._id, classroom: classroom._id, itemType: 'ASSIGNMENT', itemId: assignment._id, score, maxScore: assignment.totalPoints, submittedAt: sub.submittedAt },
          { upsert: true }
        );
      }
    }
  }
  console.log('✅ Submissions & progress (bài tập) đã tạo');

  // ── 8. Bài kiểm tra (Exams) ──────────────────────────────────────────────
  const exam1 = await Exam.findOneAndUpdate(
    { classroom: classroom._id, title: 'Kiểm tra giữa kỳ - Mạng máy tính' },
    {
      classroom: classroom._id,
      teacher: teacher._id,
      title: 'Kiểm tra giữa kỳ - Mạng máy tính',
      description: 'Kiểm tra kiến thức mô hình OSI, TCP/IP, địa chỉ IP và subnetting.',
      duration: 45,
      startTime: daysAgo(14),
      endTime: daysAgo(14), // đã kết thúc
      maxAttempts: 1,
      showResult: 'after_submit',
      isPublished: true,
      shuffle: true,
    },
    { upsert: true, new: true }
  );

  // Thêm câu hỏi cho Exam 1
  const existingQs = await Question.countDocuments({ exam: exam1._id });
  if (existingQs === 0) {
    const questionsData = [
      {
        type: 'multiple_choice',
        content: 'Mô hình OSI có bao nhiêu tầng?',
        options: [
          { text: '4', isCorrect: false },
          { text: '5', isCorrect: false },
          { text: '7', isCorrect: true },
          { text: '9', isCorrect: false },
        ],
        points: 1,
        order: 1,
      },
      {
        type: 'multiple_choice',
        content: 'Giao thức nào hoạt động ở tầng Transport?',
        options: [
          { text: 'IP', isCorrect: false },
          { text: 'TCP', isCorrect: true },
          { text: 'HTTP', isCorrect: false },
          { text: 'Ethernet', isCorrect: false },
        ],
        points: 1,
        order: 2,
      },
      {
        type: 'multiple_choice',
        content: 'Địa chỉ IP 192.168.1.0/24 có bao nhiêu host khả dụng?',
        options: [
          { text: '256', isCorrect: false },
          { text: '255', isCorrect: false },
          { text: '254', isCorrect: true },
          { text: '253', isCorrect: false },
        ],
        points: 1,
        order: 3,
      },
      {
        type: 'multiple_choice',
        content: 'TCP thực hiện bắt tay mấy bước?',
        options: [
          { text: '2 bước', isCorrect: false },
          { text: '3 bước', isCorrect: true },
          { text: '4 bước', isCorrect: false },
          { text: '5 bước', isCorrect: false },
        ],
        points: 1,
        order: 4,
      },
      {
        type: 'multiple_choice',
        content: 'Giao thức DNS sử dụng port nào?',
        options: [
          { text: '21', isCorrect: false },
          { text: '53', isCorrect: true },
          { text: '80', isCorrect: false },
          { text: '443', isCorrect: false },
        ],
        points: 1,
        order: 5,
      },
      {
        type: 'multiple_choice',
        content: 'Loại địa chỉ IP nào KHÔNG thể dùng trên Internet công cộng?',
        options: [
          { text: '203.0.113.5', isCorrect: false },
          { text: '8.8.8.8', isCorrect: false },
          { text: '192.168.1.1', isCorrect: true },
          { text: '172.217.0.1', isCorrect: false },
        ],
        points: 1,
        order: 6,
      },
      {
        type: 'multiple_choice',
        content: 'Thiết bị nào hoạt động ở tầng Network (tầng 3)?',
        options: [
          { text: 'Hub', isCorrect: false },
          { text: 'Switch', isCorrect: false },
          { text: 'Router', isCorrect: true },
          { text: 'Repeater', isCorrect: false },
        ],
        points: 1,
        order: 7,
      },
      {
        type: 'multiple_choice',
        content: 'Phương thức nào DHCP dùng để client tìm server?',
        options: [
          { text: 'Unicast', isCorrect: false },
          { text: 'Multicast', isCorrect: false },
          { text: 'Broadcast', isCorrect: true },
          { text: 'Anycast', isCorrect: false },
        ],
        points: 1,
        order: 8,
      },
      {
        type: 'multiple_choice',
        content: 'Subnet mask /26 tương đương với?',
        options: [
          { text: '255.255.255.0', isCorrect: false },
          { text: '255.255.255.128', isCorrect: false },
          { text: '255.255.255.192', isCorrect: true },
          { text: '255.255.255.224', isCorrect: false },
        ],
        points: 1,
        order: 9,
      },
      {
        type: 'multiple_choice',
        content: 'UDP khác TCP ở điểm nào quan trọng nhất?',
        options: [
          { text: 'UDP nhanh hơn vì không đảm bảo giao hàng', isCorrect: true },
          { text: 'UDP dùng port số lớn hơn', isCorrect: false },
          { text: 'UDP bảo mật hơn TCP', isCorrect: false },
          { text: 'UDP chỉ dùng trong mạng nội bộ', isCorrect: false },
        ],
        points: 1,
        order: 10,
      },
    ];

    for (const qd of questionsData) {
      await Question.create({ ...qd, exam: exam1._id });
    }
    // Update exam tổng điểm
    await Exam.findByIdAndUpdate(exam1._id, { totalPoints: 10, questionCount: 10 });
  }
  console.log('✅ Exam & câu hỏi đã tạo');

  // ── 9. Nộp bài thi (ExamSubmissions) ─────────────────────────────────────
  const questions = await Question.find({ exam: exam1._id }).lean();
  const examScores = [7, 8, 9, 6, 8, 7, 6, 9, 8, 7, 6, 8];

  for (let si = 0; si < students.length; si++) {
    const student = students[si];
    const rawScore = examScores[si];
    const existing = await ExamSubmission.findOne({ exam: exam1._id, student: student._id });
    if (!existing) {
      // Tạo answers (đúng rawScore câu)
      const answers = questions.map((q, idx) => {
        const correctOption = q.options.find((o) => o.isCorrect);
        const wrongOption   = q.options.find((o) => !o.isCorrect);
        const isCorrect = idx < rawScore;
        const selected = isCorrect ? correctOption : wrongOption;
        return {
          question: q._id,
          selectedOptions: selected ? [selected._id] : [],
          isCorrect,
          pointsAchieved: isCorrect ? 1 : 0,
        };
      });

      const startedAt  = new Date(exam1.startTime.getTime() + rand(0, 5) * 60000);
      const submittedAt= new Date(startedAt.getTime() + rand(25, 44) * 60000);

      await ExamSubmission.create({
        exam: exam1._id,
        student: student._id,
        classroom: classroom._id,
        answers,
        score: rawScore,
        status: 'graded',
        gradingStatus: 'auto_graded',
        startedAt,
        submittedAt,
        attemptNumber: 1,
      });

      // Ghi progress
      await StudentProgress.findOneAndUpdate(
        { student: student._id, classroom: classroom._id, itemType: 'EXAM', itemId: exam1._id },
        { student: student._id, classroom: classroom._id, itemType: 'EXAM', itemId: exam1._id, score: rawScore, maxScore: 10, submittedAt },
        { upsert: true }
      );
    }
  }
  console.log('✅ ExamSubmissions & progress (bài thi) đã tạo');

  // ── 10. Progress bài giảng (LESSON) ──────────────────────────────────────
  // Mỗi học sinh hoàn thành các bài giảng theo mức độ khác nhau
  const lectureCompletionRates = [7, 8, 8, 5, 7, 6, 5, 8, 7, 6, 5, 7]; // số bài hoàn thành
  for (let si = 0; si < students.length; si++) {
    const student = students[si];
    const completedCount = Math.min(lectureCompletionRates[si], lectures.length);
    for (let li = 0; li < completedCount; li++) {
      await StudentProgress.findOneAndUpdate(
        { student: student._id, classroom: classroom._id, itemType: 'LESSON', itemId: lectures[li]._id },
        { student: student._id, classroom: classroom._id, itemType: 'LESSON', itemId: lectures[li]._id, completedAt: daysAgo(rand(1, 15)) },
        { upsert: true }
      );
    }
  }
  console.log('✅ Student progress (lectures) đã tạo');

  // ── 11. Điểm danh (Attendance) ────────────────────────────────────────────
  const sessionDates = [
    daysAgo(35), daysAgo(28), daysAgo(21), daysAgo(14), daysAgo(7),
    daysAgo(4), daysAgo(2),
  ];
  for (const date of sessionDates) {
    const existing = await AttendanceSession.findOne({ classroom: classroom._id, date: { $gte: new Date(date.getFullYear(), date.getMonth(), date.getDate()), $lt: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1) } });
    if (!existing) {
      const session = await AttendanceSession.create({
        classroom: classroom._id,
        teacher: teacher._id,
        date,
        status: 'closed',
      });

      const statusChoices = ['present', 'present', 'present', 'present', 'late', 'absent'];
      for (const student of students) {
        await AttendanceRecord.create({
          session: session._id,
          student: student._id,
          status: pick(statusChoices),
          time: new Date(date.getTime() + rand(0, 10) * 60000),
        });
      }
    }
  }
  console.log('✅ Attendance sessions & records đã tạo');

  // ── 12. Thảo luận (Discussion) ────────────────────────────────────────────
  const topicsData = [
    {
      author: teacher._id,
      title: '📌 [Thông báo] Lịch kiểm tra giữa kỳ',
      content: 'Các em chú ý! Kiểm tra giữa kỳ môn Mạng Máy Tính sẽ diễn ra vào tuần tới. Nội dung gồm Chương 1, 2 và 3. Hình thức: 10 câu trắc nghiệm, thời gian 45 phút. Chúc các em ôn tập tốt! 💪',
      isPinned: true,
      replies: [
        { author: students[0]._id, content: 'Dạ thầy/cô ơi, có được mang tài liệu vào không ạ?' },
        { author: teacher._id, content: 'Không em nhé, bài thi đóng tài liệu hoàn toàn.' },
        { author: students[1]._id, content: 'Dạ em hiểu rồi, cảm ơn thầy/cô ạ!' },
        { author: students[3]._id, content: 'Thầy/cô ơi, phần subnetting có ra không ạ?' },
        { author: teacher._id, content: 'Có em ơi, chương 2 nằm trong phạm vi thi đấy nhé.' },
      ],
    },
    {
      author: students[2]._id,
      title: 'Hỏi về sự khác biệt TCP và UDP khi stream video',
      content: 'Mình đang thắc mắc tại sao YouTube và Netflix lại dùng UDP (qua QUIC) thay vì TCP vì TCP mới đảm bảo giao hàng chứ? Bạn nào giải thích giúp mình với!',
      isPinned: false,
      replies: [
        { author: students[4]._id, content: 'Mình nghĩ vì với video streaming, quan trọng hơn là tốc độ chứ không phải chính xác tuyệt đối. Mất vài frame không ảnh hưởng nhiều bằng lag liên tục.' },
        { author: students[7]._id, content: 'Đúng rồi! Và QUIC (dựa trên UDP) còn tự implement lại phần kiểm soát lỗi ở tầng ứng dụng, hiệu quả hơn TCP thuần.' },
        { author: teacher._id, content: 'Các em phân tích đúng! Thêm một điểm nữa: TCP head-of-line blocking - khi một segment bị mất, toàn bộ stream phải đợi retransmit. QUIC giải quyết được vấn đề này.' },
        { author: students[2]._id, content: 'À mình hiểu rồi! Cảm ơn thầy/cô và các bạn nhiều ạ 😊' },
      ],
    },
    {
      author: students[5]._id,
      title: 'Chia sẻ tool kiểm tra IP nhanh trên terminal',
      content: 'Mình muốn chia sẻ một số lệnh Linux/Windows hữu ích khi học mạng:\n- `ipconfig /all` (Windows) hoặc `ip addr` (Linux): xem IP\n- `ping 8.8.8.8`: kiểm tra kết nối\n- `tracert google.com` (Windows) / `traceroute google.com` (Linux): xem đường đi gói tin\n- `nslookup google.com`: tra cứu DNS\n- `netstat -an`: xem các cổng đang mở\nCác bạn có lệnh nào hay không?',
      isPinned: false,
      replies: [
        { author: students[9]._id, content: 'Mình hay dùng `nmap -sV host` để scan port và service version. Rất hữu ích khi làm bài tập!' },
        { author: students[1]._id, content: '`arp -a` để xem ARP table cũng hay nè. Biết được MAC address của các thiết bị trong mạng.' },
        { author: students[3]._id, content: 'Wireshark đương nhiên rồi 😄 Nhưng CLI thì mình dùng `tcpdump -i eth0 port 80` để bắt gói tin.' },
      ],
    },
    {
      author: students[0]._id,
      title: 'Tài liệu ôn tập Subnetting - ai có không share với?',
      content: 'Phần subnetting mình còn yếu lắm. Bạn nào có tài liệu hay worksheet để luyện tập không? Share link vào đây với ạ 🙏',
      isPinned: false,
      replies: [
        { author: students[6]._id, content: 'Trang subnettingpractice.com rất hay, có từng bài từ dễ đến khó và tự chấm điểm luôn bạn ơi!' },
        { author: students[8]._id, content: 'Kênh YouTube "Professor Messer" có video giải thích subnetting rất dễ hiểu nhé. Tìm "Subnetting Made Easy" là ra.' },
        { author: teacher._id, content: 'Thầy/cô sẽ upload thêm worksheet vào tuần tới. Các em cũng có thể tham khảo sách "Computer Networking: A Top-Down Approach" của Kurose & Ross - sách giáo khoa chuẩn của ngành.' },
      ],
    },
  ];

  for (const td of topicsData) {
    const existing = await DiscussionTopic.findOne({ classroom: classroom._id, title: td.title });
    if (!existing) {
      const topic = await DiscussionTopic.create({
        classroom: classroom._id,
        author: td.author,
        title: td.title,
        content: td.content,
        isPinned: td.isPinned,
      });
      for (const reply of td.replies) {
        await DiscussionReply.create({ topic: topic._id, author: reply.author, content: reply.content });
      }
    }
  }
  console.log('✅ Discussion topics & replies đã tạo');

  // ── 13. Chat messages ─────────────────────────────────────────────────────
  const chatMsgs = [
    { sender: teacher._id, content: 'Chào các em! Hôm nay chúng ta sẽ học về mô hình OSI nhé 👋' },
    { sender: students[0]._id, content: 'Dạ chào thầy/cô ạ!' },
    { sender: students[2]._id, content: 'Em đã đọc bài trước rồi ạ, rất thú vị!' },
    { sender: students[4]._id, content: 'Thầy/cô ơi, phần TCP handshake em chưa hiểu lắm ạ' },
    { sender: teacher._id, content: 'Em xem bài giảng chương 3 nhé, thầy/cô giải thích chi tiết ở đó 😊' },
    { sender: students[7]._id, content: 'Bài tập 2 subnetting khó quá, bạn nào làm xong chỉ mình với' },
    { sender: students[1]._id, content: 'Mình cũng đang làm, bài 3 tính ra 8 subnet /27 rồi bạn ơi' },
    { sender: students[3]._id, content: 'Mọi người đã làm bài tập chưa?' },
    { sender: students[5]._id, content: 'Em nộp bài rồi a.' },
    { sender: teacher._id, content: 'Mọi người đã làm bài tập chưa? Deadline tuần này đấy nhé 📝' },
    { sender: students[9]._id, content: 'ra cha' },
    { sender: teacher._id, content: 'vậy thì làm ngay đi nha' },
    { sender: students[2]._id, content: 'Chào mọi người!' },
  ];

  const existingMsgCount = await ChatMessage.countDocuments({ classroom: classroom._id });
  if (existingMsgCount === 0) {
    let t = daysAgo(3).getTime();
    for (const cm of chatMsgs) {
      t += rand(60000, 600000); // cách nhau 1-10 phút
      await ChatMessage.create({ classroom: classroom._id, sender: cm.sender, content: cm.content, createdAt: new Date(t) });
    }
    console.log(`✅ ${chatMsgs.length} chat messages đã tạo`);
  } else {
    console.log(`⏭️  Chat messages đã tồn tại (${existingMsgCount}), bỏ qua`);
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  console.log('\n🎉 Seed hoàn thành! Tóm tắt:');
  console.log(`   • Lớp: ${classroom.name} (${classroom.code})`);
  console.log(`   • Giáo viên: ${teacher.name} (${teacher.email})`);
  console.log(`   • ${students.length} học sinh`);
  console.log(`   • ${lectures.length} bài giảng (${lectureData.filter(l => l.isPublished).length} đã xuất bản)`);
  console.log(`   • ${assignments.length} bài tập`);
  console.log(`   • 1 bài kiểm tra (${questions.length || 10} câu hỏi)`);
  console.log(`   • ${sessionDates.length} buổi điểm danh`);
  console.log(`   • ${topicsData.length} chủ đề thảo luận`);
  console.log(`   • ${chatMsgs.length} tin nhắn chat`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Seed thất bại:', err);
  mongoose.disconnect();
  process.exit(1);
});
