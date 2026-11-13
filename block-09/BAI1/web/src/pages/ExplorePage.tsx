import DishCollection from '../components/DishCollection';
export default function ExplorePage() {
  return <main className="explore-page"><section className="menu-section"><div className="section-heading"><div><span className="eyebrow">THEO DÒNG HƯƠNG VỊ</span><h1>Khám phá căn bếp.</h1><p>Cuộn chậm một chút, tìm thêm một món ngon.</p></div><span className="season-note">✳ Mỗi món ăn, một niềm vui mới</span></div><DishCollection infinite /></section></main>;
}
