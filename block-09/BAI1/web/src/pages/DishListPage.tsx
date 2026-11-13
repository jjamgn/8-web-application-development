import DishCollection from '../components/DishCollection';

export default function DishListPage() {
  return <main><section className="hero"><div className="hero-copy"><span className="eyebrow"><span />TỪ CĂN BẾP CỦA CHÚNG MÌNH</span>
    <h1>Hương vị Việt,<br /><em>trọn vị thân quen.</em></h1><p>Những nguyên liệu gần gũi, những công thức được nâng niu.<br />Cùng Bếp Nhà tìm một món ngon cho hôm nay nhé.</p>
    <button className="button primary" onClick={() => document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' })}>Khám phá thực đơn</button>
    <div className="hero-proof"><span className="proof-symbol" aria-hidden="true">✳</span><span>Nguyên liệu tươi mỗi ngày<br /><strong>Nấu bằng cả sự tận tâm</strong></span><span className="hero-divider" /><span className="proof-number">100%</span><span>Hương vị Việt<br /><strong>Cảm hứng đương đại</strong></span></div>
  </div><div className="hero-visual"><img src="/images/beef.png" alt="Món Việt từ căn bếp Bếp Nhà" fetchPriority="high" /><div className="hero-stamp" aria-hidden="true">NẤU BẰNG<br /><span>♡</span><br />CẢ TẤM LÒNG</div><div className="hero-caption"><span>MÓN NGON TỪ BẾP</span><strong>Một chút hương vị thân quen</strong></div></div></section>
    <section className="menu-section" id="menu"><div className="section-heading"><div><span className="eyebrow">MỖI MÓN ĂN, MỘT CÂU CHUYỆN</span><h2>Hôm nay, bạn muốn ăn gì?</h2></div><span className="season-note">✳ Tươi ngon từ những điều giản dị</span></div>
      <DishCollection />
      <div className="menu-footnote"><span aria-hidden="true">✳</span><p>Mỗi món ăn đều được chuẩn bị khi bạn gọi.<br />Nếu bạn dị ứng với nguyên liệu nào, hãy trao đổi với nhân viên trước khi dùng món.</p><span className="handwritten">Chúc bạn ngon miệng!</span></div>
    </section></main>;
}
