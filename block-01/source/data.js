/*
 * ĐIỀN THÔNG TIN TẠI ĐÂY.
 * Giữ nguyên id của thành viên nếu dự án đang tham chiếu đến id đó.
 * Các chuỗi "" là thông tin cá nhân đang để trống.
 * photo, cv có thể là đường dẫn tương đối: "assets/thanh-vien-1.jpg".
 * GitHub / LinkedIn / demo nên dùng đường dẫn https:// đầy đủ.
 */
window.PORTFOLIO_DATA = {
  team: { name: "TRIAD", email: "triad@gmail.com", github: "triad@github.com" },
  members: [
    {
      id: "member-1", name: "Ngô Thị Thanh Thuyết", studentId: "24127554", school: "Trường Đại học Khoa học tự nhiên, ĐHQG HCM", major: "Kỹ thuật phần mềm", email: "nttt@clc.fitus.edu.vn", github: "nttt@github.com", linkedin: "", cv: "",
      role: "Frontend & UI/UX",
      bio: "Quan tâm đến giao diện rõ ràng và trải nghiệm sử dụng thuận tiện trên nhiều thiết bị.",
      introduction: "Định hướng phát triển giao diện web, tổ chức thành phần và kết nối dữ liệu từ API. Yêu thích việc chuyển yêu cầu thành những luồng sử dụng dễ hiểu.",
      skills: ["HTML", "CSS", "JavaScript", "Figma"],
      focus: ["Thiết kế giao diện và luồng sử dụng", "Xây dựng giao diện thích ứng với màn hình", "Kết nối API và xử lý trạng thái giao diện"],
      achievements: [],
    },
    {
      id: "member-2", name: "Nguyễn Lâm Thảo Trang", studentId: "24127566", school: "Trường Đại học Khoa học tự nhiên, ĐHQG HCM", major: "Kỹ thuật phần mềm", email: "nltt@clc.fitus.edu.vn", github: "nltt@github.com", linkedin: "", cv: "",
      role: "Backend & Database",
      bio: "Quan tâm đến xử lý nghiệp vụ, thiết kế dữ liệu và cách các thành phần hệ thống phối hợp.",
      introduction: "Định hướng phát triển backend, xây dựng API và mô hình dữ liệu. Tập trung vào tính nhất quán, xử lý lỗi và cách thiết kế một giải pháp dễ mở rộng.",
      skills: ["Java", "SQL", "REST API", "Git"],
      focus: ["Phân tích và thiết kế cơ sở dữ liệu", "Xây dựng API theo nghiệp vụ", "Kiểm soát dữ liệu đầu vào và xử lý lỗi"],
      achievements: [],
    },
    {
      id: "member-3", name: "Cao Hải Vy", studentId: "24127598", school: "Trường Đại học Khoa học tự nhiên, ĐHQG HCM", major: "Kỹ thuật phần mềm", email: "chv@clc.fitus.edu.vn", github: "chv@github.com", linkedin: "", cv: "", photo: "",
      role: "Testing & Integration",
      bio: "Quan tâm đến chất lượng sản phẩm, các tình huống sử dụng và việc kết nối các thành phần.",
      introduction: "Định hướng kiểm thử và tích hợp phần mềm. Tập trung vào việc làm rõ yêu cầu, kiểm tra các luồng chính và ghi nhận vấn đề để cả nhóm cùng cải tiến.",
      skills: ["Postman", "Test case", "GitHub", "Documentation"],
      focus: ["Thiết kế tình huống kiểm thử", "Kiểm tra API và luồng nghiệp vụ", "Tích hợp chức năng và hoàn thiện tài liệu"],
      achievements: [],
    },
  ],
  projects: [
    {
      id: "flowtask", title: "FlowTask", category: "web", categoryLabel: "Ứng dụng web", year: "Mẫu 01", preview: "tasks", sample: true,
      summary: "Ứng dụng quản lý công việc nhóm với bảng tiến độ, phân công nhiệm vụ và theo dõi thời hạn.",
      problem: "Khi làm bài tập nhóm, nhiệm vụ và tiến độ dễ bị phân tán trong nhiều cuộc trò chuyện. FlowTask tập trung chúng vào một không gian chung để mỗi người biết mình cần làm gì.",
      features: ["Tạo dự án và phân công công việc", "Theo dõi trạng thái: Cần làm, Đang làm, Hoàn thành", "Lọc nhiệm vụ theo người phụ trách và thời hạn", "Hiển thị phù hợp trên máy tính và điện thoại"],
      stack: ["HTML / CSS", "JavaScript", "REST API"],
      contributions: [{memberId:"member-1",work:"Thiết kế bảng công việc và giao diện danh sách nhiệm vụ."},{memberId:"member-2",work:"Thiết kế mô hình dự án, nhiệm vụ và API cập nhật trạng thái."},{memberId:"member-3",work:"Kiểm thử phân công nhiệm vụ, chuyển trạng thái và tích hợp giao diện."}],
      learning: "Phân chia công việc theo tính năng, thống nhất dữ liệu giữa frontend và backend, xử lý các trạng thái trống và lỗi.",
      status: "Ý tưởng dự án minh họa; chưa có sản phẩm hoặc số liệu thực tế.", demo: "", github: "",
    },
    {
      id: "campus-library", title: "Campus Library", category: "system", categoryLabel: "Hệ thống quản lý", year: "Mẫu 02", preview: "library", sample: true,
      summary: "Hệ thống quản lý thư viện với danh mục sách, phiếu mượn trả và kiểm tra tình trạng tài liệu.",
      problem: "Danh mục sách và lịch sử mượn trả cần được lưu nhất quán. Campus Library là ý tưởng hệ thống giúp người quản lý tra cứu tài liệu và xử lý mượn trả theo một quy trình rõ ràng.",
      features: ["Quản lý sách, danh mục và người mượn", "Tra cứu tình trạng còn sách", "Tạo phiếu mượn và xác nhận trả", "Lưu lịch sử và kiểm tra điều kiện mượn"],
      stack: ["Java", "SQL", "JDBC"],
      contributions: [{memberId:"member-1",work:"Thiết kế màn hình tìm sách và tạo phiếu mượn."},{memberId:"member-2",work:"Thiết kế cơ sở dữ liệu và xử lý nghiệp vụ mượn trả."},{memberId:"member-3",work:"Kiểm tra ràng buộc, dữ liệu không hợp lệ và luồng trả sách."}],
      learning: "Mô hình hóa quan hệ dữ liệu, xác định ràng buộc và kiểm tra các tình huống thay đổi trạng thái.",
      status: "Ý tưởng dự án minh họa; chưa có sản phẩm hoặc số liệu thực tế.", demo: "", github: "",
    },
    {
      id: "mini-commerce", title: "Mini Commerce", category: "web", categoryLabel: "Ứng dụng web", year: "Mẫu 03", preview: "commerce", sample: true,
      summary: "Website bán hàng cơ bản với danh mục sản phẩm, giỏ hàng và quy trình tạo đơn hàng.",
      problem: "Một cửa hàng nhỏ cần giới thiệu sản phẩm và nhận đơn theo cách đơn giản. Mini Commerce là ý tưởng website tập trung vào luồng tìm sản phẩm, thêm vào giỏ và tạo đơn.",
      features: ["Xem và lọc danh mục sản phẩm", "Thêm, cập nhật số lượng và xóa sản phẩm trong giỏ", "Kiểm tra dữ liệu trước khi tạo đơn", "Xem thông tin và trạng thái đơn hàng"],
      stack: ["JavaScript", "Java", "MySQL"],
      contributions: [{memberId:"member-1",work:"Xây dựng trang sản phẩm, giỏ hàng và giao diện tạo đơn."},{memberId:"member-2",work:"Xây dựng API sản phẩm, đơn hàng và mô hình dữ liệu."},{memberId:"member-3",work:"Kiểm thử số lượng, dữ liệu nhập và các luồng tạo đơn."}],
      learning: "Kiểm tra dữ liệu ở nhiều lớp, thống nhất hợp đồng API và xử lý nghiệp vụ theo luồng sử dụng.",
      status: "Ý tưởng dự án minh họa; chưa có sản phẩm hoặc số liệu thực tế.", demo: "", github: "",
    },
  ],
  skillGroups: [
    {title:"Frontend",description:"Giao diện và trải nghiệm sử dụng.",skills:["HTML", "CSS", "JavaScript", "Responsive UI"]},
    {title:"Backend & dữ liệu",description:"API, nghiệp vụ và mô hình dữ liệu.",skills:["Java", "REST API", "SQL", "MySQL"]},
    {title:"Kiểm thử",description:"Kiểm tra hành vi và luồng nghiệp vụ.",skills:["Postman", "Test case", "API testing"]},
    {title:"Cộng tác",description:"Phân công, trao đổi và quản lý phiên bản.",skills:["Git", "GitHub", "Figma", "Documentation"]},
  ],
};
