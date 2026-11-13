export const categories = ['Khai vị', 'Món chính', 'Món chay', 'Tráng miệng'];
export const chefs = [
  { id: 1, name: 'Nguyễn Minh An', specialty: 'Ẩm thực Việt đương đại', bio: 'Gìn giữ hương vị quen thuộc, kể lại bằng một góc nhìn mới.' },
  { id: 2, name: 'Trần Hoài Thương', specialty: 'Món chay & bánh ngọt', bio: 'Tìm cảm hứng từ rau củ theo mùa và những khu vườn nhỏ.' },
  { id: 3, name: 'Lê Quốc Bảo', specialty: 'Món nướng & hải sản', bio: 'Nâng niu nguyên liệu tươi với lửa than và gia vị bản địa.' }
];
export const ingredients = [
  {id:1,name:'Thịt bò',unit:'g'}, {id:2,name:'Bún tươi',unit:'g'},
  {id:3,name:'Rau thơm',unit:'g'}, {id:4,name:'Nấm',unit:'g'},
  {id:5,name:'Cá lóc',unit:'g'}, {id:6,name:'Nước cốt dừa',unit:'ml'},
  {id:7,name:'Xoài',unit:'g'}, {id:8,name:'Bánh tráng',unit:'cái'},
  {id:9,name:'Đậu hũ',unit:'g'}, {id:10,name:'Sả',unit:'g'}
];
const recipes = [
  ['Bún bò nướng sả', 'Món chính', 125000, 1, 'beef', 'Bò ướp sả nướng thơm trên than hồng, bún tươi và rau vườn. Dùng cùng nước mắm chua ngọt pha theo công thức riêng của Bếp Nhà.', [[1,150],[2,180],[3,30],[10,15]]],
  ['Chả giò giòn rụm', 'Khai vị', 79000, 3, 'rolls', 'Lớp bánh tráng vàng giòn ôm phần nhân nấm và rau củ đầy đặn. Cuốn cùng xà lách, rau thơm và chấm nước mắm thanh nhẹ.', [[8,5],[4,80],[3,30]]],
  ['Cá kho tộ quê nhà', 'Món chính', 159000, 3, 'fish', 'Cá lóc kho chậm trong niêu đất, nước màu dừa sóng sánh cùng tiêu đen và chút ớt cay. Hương vị thân quen của một bữa cơm nhà.', [[5,250],[6,30],[3,10]]],
  ['Panna cotta dừa xoài', 'Tráng miệng', 65000, 2, 'dessert', 'Panna cotta nước cốt dừa mềm mịn, xoài chín theo mùa và dừa rang. Một kết thúc nhẹ nhàng cho bữa ăn trọn vẹn.', [[6,100],[7,80]]],
  ['Bún nấm vườn nhà', 'Món chay', 95000, 2, 'beef', 'Bún tươi cùng nấm áp chảo, rau thơm theo mùa và sốt chay chua ngọt. Thanh lành, đủ đầy và đậm đà.', [[2,180],[4,120],[3,30]]],
  ['Gỏi cuốn rau vườn', 'Khai vị', 69000, 2, 'rolls', 'Rau xanh và nấm được cuốn gọn trong bánh tráng mềm. Dùng cùng sốt đậu thơm béo và rau húng tươi.', [[8,4],[4,80],[3,50]]],
  ['Đậu hũ kho nấm', 'Món chay', 89000, 2, 'fish', 'Đậu hũ kho cùng nấm trong sốt nước tương gừng. Món chay ấm bụng dành cho những ngày muốn ăn thật nhẹ.', [[9,200],[4,100],[3,10]]],
  ['Xoài dừa nhiệt đới', 'Tráng miệng', 59000, 2, 'dessert', 'Xoài chín thơm, kem dừa mát lành và dừa rang giòn. Vị ngọt tự nhiên lưu lại thật dịu dàng.', [[7,150],[6,80]]]
] as const;
export const dishes = recipes.slice(0,8).map((r,i)=>({ id:i+1,name:r[0],category:r[1],price:r[2],chefId:r[3],imagePath:`/images/${['beef','rolls','fish','dessert','mushroom','fresh-rolls','tofu','mango'][i]}.png`,description:r[5],available:i!==6,ingredients:r[6].map(([ingredientId,quantity])=>({ingredientId,quantity,ingredient:ingredients.find(x=>x.id===ingredientId)})),chef:chefs.find(c=>c.id===r[3]) }));
