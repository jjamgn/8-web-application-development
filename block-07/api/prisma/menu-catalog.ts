type Part = { name: string; quantity: number; unit: string };
export type MenuEntry = { name: string; description: string; category: string; price: number; chefRole: 'savory' | 'vegetarian'; ingredients: Part[]; imagePrompt: string };
const p = (name: string, quantity = 20, unit = 'g'): Part => ({ name, quantity, unit });
const proteins = [['bò','Thịt bò'],['gà','Thịt gà'],['vịt','Thịt vịt'],['heo','Thịt heo'],['tôm','Tôm'],['mực','Mực'],['cá lóc','Cá lóc'],['cá hồi','Cá hồi'],['cá basa','Cá basa'],['cá thu','Cá thu'],['cá diêu hồng','Cá diêu hồng'],['bạch tuộc','Bạch tuộc'],['sò điệp','Sò điệp'],['cua','Thịt cua'],['ếch','Thịt ếch'],['cá chẽm','Cá chẽm']];
const salads = [['xoài xanh','Xoài xanh'],['đu đủ xanh','Đu đủ xanh'],['ngó sen','Ngó sen'],['bắp chuối','Bắp chuối'],['bắp cải tím','Bắp cải tím'],['dưa leo','Dưa leo'],['củ hủ dừa','Củ hủ dừa'],['rau muống','Rau muống'],['bưởi','Bưởi'],['cóc xanh','Cóc xanh'],['khế xanh','Khế xanh'],['cà rốt','Cà rốt'],['cải mầm','Cải mầm'],['rau càng cua','Rau càng cua'],['su hào','Su hào'],['đu đủ chín','Đu đủ chín']];
const savoryMethods: [string,string,Part[]][] = [
  ['nướng sả','ướp sả, nướng đến khi dậy mùi và xém cạnh',[p('Sả',15),p('Dầu ăn',10,'ml')]],
  ['kho tiêu','kho lửa nhỏ cùng tiêu đen và nước màu',[p('Tiêu đen',3),p('Nước màu',15,'ml')]],
  ['sốt me','áp chảo rồi áo sốt me chua ngọt',[p('Me',25),p('Đường',10)]],
  ['rang muối','chiên ráo rồi xóc với muối rang và sả',[p('Muối',3),p('Sả',10),p('Bột bắp',20)]],
  ['sốt chanh dây','áp chảo, dùng với sốt chanh dây chua dịu',[p('Chanh dây',40),p('Đường',10)]],
  ['hấp gừng','hấp nhẹ cùng gừng thái sợi và hành lá',[p('Gừng',15),p('Hành lá',10)]],
  ['xào sa tế','xào nhanh trên lửa lớn với sa tế thơm cay',[p('Sa tế',15),p('Hành tây',60)]],
  ['cà ri dừa','nấu cà ri với nước cốt dừa đến khi thấm vị',[p('Bột cà ri',8),p('Nước cốt dừa',100,'ml'),p('Khoai tây',80)]],
  ['sốt tỏi','áp chảo rồi đảo đều trong sốt tỏi phi',[p('Tỏi',20),p('Dầu ăn',10,'ml')]],
  ['nướng lá chanh','ướp lá chanh thái chỉ và nướng thơm',[p('Lá chanh',5),p('Dầu ăn',10,'ml')]],
  ['sốt gừng','rim trong sốt gừng thanh ấm',[p('Gừng',20),p('Hành tây',40)]],
  ['sốt dứa','nấu cùng sốt dứa tươi chua ngọt',[p('Dứa',80),p('Cà chua',40)]],
  ['xào nấm đông cô','xào với nấm đông cô và hành tây',[p('Nấm đông cô',80),p('Hành tây',40)]],
  ['sốt tiêu xanh','áp chảo và rim sốt tiêu xanh',[p('Tiêu xanh',15),p('Hành tây',40)]],
  ['chiên sả ớt','chiên vàng rồi đảo với sả và ớt tươi',[p('Sả',20),p('Ớt',5),p('Dầu ăn',20,'ml')]],
  ['sốt cam','áp chảo và phủ sốt cam tươi',[p('Cam',100),p('Đường',10)]],
];
const vegetables = [['đậu hũ','Đậu hũ'],['nấm đông cô','Nấm đông cô'],['nấm đùi gà','Nấm đùi gà'],['nấm bào ngư','Nấm bào ngư'],['cà tím','Cà tím'],['bí đỏ','Bí đỏ'],['bông cải xanh','Bông cải xanh'],['củ sen','Củ sen'],['măng tươi','Măng tươi'],['đậu bắp','Đậu bắp'],['su su','Su su'],['khoai tây','Khoai tây'],['bắp non','Bắp non'],['đậu que','Đậu que'],['cải thìa','Cải thìa'],['khổ qua','Khổ qua']];
const veganMethods: [string,string,Part[]][] = [
  ['kho gừng chay','kho nhỏ lửa với gừng và nước tương',[p('Gừng',15),p('Nước tương',20,'ml')]],
  ['xào tỏi chay','xào nhanh cùng tỏi phi',[p('Tỏi',15),p('Dầu ăn',10,'ml')]],
  ['sốt mè chay','áp chảo và áo sốt mè rang',[p('Mè trắng',15),p('Nước tương',15,'ml')]],
  ['sốt cà chua chay','om trong sốt cà chua tươi',[p('Cà chua',100),p('Hành lá',10)]],
  ['kho sả chay','kho cùng sả băm và nước tương',[p('Sả',20),p('Nước tương',20,'ml')]],
  ['sốt me chay','rim sốt me chua ngọt',[p('Me',25),p('Đường',10)]],
  ['xào húng quế chay','xào với húng quế và ớt tươi',[p('Húng quế',15),p('Ớt',3)]],
  ['cà ri chay','nấu cà ri nước cốt dừa',[p('Bột cà ri',8),p('Nước cốt dừa',100,'ml')]],
  ['sốt tiêu xanh chay','rim sốt tiêu xanh thơm dịu',[p('Tiêu xanh',15),p('Nước tương',20,'ml')]],
  ['xào gừng chay','xào với gừng thái sợi và hành lá',[p('Gừng',20),p('Hành lá',10)]],
  ['om nước dừa chay','om chậm trong nước dừa tươi',[p('Nước dừa',100,'ml'),p('Hành tím',10)]],
  ['sốt đậu phộng chay','nấu cùng sốt đậu phộng bùi béo',[p('Đậu phộng',30),p('Nước cốt dừa',40,'ml')]],
  ['xào nghệ chay','xào với nghệ tươi và hành lá',[p('Nghệ',10),p('Hành lá',10)]],
  ['sốt chao chay','áp chảo và phủ sốt chao',[p('Chao',25),p('Đường',5)]],
  ['sốt chanh chay','áp chảo cùng sốt chanh thanh nhẹ',[p('Chanh',30),p('Đường',8)]],
  ['xào sa tế chay','xào với sa tế chay và hành tây',[p('Sa tế chay',15),p('Hành tây',50)]],
];
const fruits = ['Xoài','Chuối','Dâu tây','Chanh dây','Dứa','Thanh long','Bơ','Sầu riêng','Mít','Vải','Nhãn','Dừa','Cam','Ổi','Đu đủ','Dưa hấu'];
const desserts: [string,string,Part[]][] = [
  ['Chè','nấu chè cùng nước cốt dừa, dùng mát',[p('Nước cốt dừa',80,'ml'),p('Bột báng',20)]],
  ['Kem','xay mịn với kem sữa, làm đông và múc thành viên',[p('Kem sữa',80,'ml'),p('Sữa tươi',50,'ml')]],
  ['Sorbet','xay với siro đường rồi làm đông thành sorbet',[p('Đường',25),p('Chanh',10)]],
  ['Pudding','nấu cùng sữa và bột bắp đến khi sánh, để lạnh',[p('Sữa tươi',100,'ml'),p('Bột bắp',12)]],
  ['Panna cotta','kết hợp lớp kem sữa đông mềm với sốt trái cây',[p('Kem sữa',100,'ml'),p('Gelatin',3)]],
  ['Sữa chua','trộn trái cây tươi cùng sữa chua mát lạnh',[p('Sữa chua',120),p('Mật ong',10)]],
  ['Thạch','nấu với bột rau câu, để đông và cắt miếng',[p('Bột rau câu',4),p('Đường',20)]],
  ['Bánh flan','phối hợp flan trứng sữa hấp mềm với sốt trái cây',[p('Trứng gà',1,'quả'),p('Sữa tươi',100,'ml')]],
  ['Mousse','trộn trái cây xay với kem đánh bông, làm lạnh',[p('Kem sữa',80,'ml'),p('Gelatin',3)]],
  ['Bánh tart','nướng vỏ tart bơ và hoàn thiện bằng kem cùng trái cây',[p('Bột mì',60),p('Bơ lạt',25),p('Kem sữa',30,'ml')]],
  ['Bánh crepe','tráng bánh mỏng và cuộn nhân trái cây cùng kem',[p('Bột mì',50),p('Trứng gà',1,'quả'),p('Kem sữa',40,'ml')]],
  ['Bánh su kem','nướng vỏ su và bơm nhân kem trái cây',[p('Bột mì',45),p('Trứng gà',1,'quả'),p('Bơ lạt',20),p('Kem sữa',40,'ml')]],
  ['Bánh muffin','trộn trái cây vào bột bánh và nướng chín mềm',[p('Bột mì',70),p('Trứng gà',1,'quả'),p('Bột nở',3),p('Bơ lạt',20)]],
  ['Bánh bông lan','nướng cốt bánh trứng mềm và phủ sốt trái cây',[p('Bột mì',60),p('Trứng gà',2,'quả'),p('Đường',25)]],
  ['Sinh tố','xay trái cây tươi với sữa và đá',[p('Sữa tươi',100,'ml'),p('Sữa đặc',20,'ml')]],
  ['Đá xay','xay trái cây với đá và siro, dùng ngay khi lạnh',[p('Đường',20),p('Chanh',10)]],
];
const title = (s: string) => s.charAt(0).toLocaleUpperCase('vi') + s.slice(1);
function parts(values: Part[]): Part[] {
  const merged = new Map<string, Part>();
  for (const value of values) merged.set(value.name, {...value, quantity: value.quantity + (merged.get(value.name)?.quantity ?? 0)});
  return [...merged.values()];
}
export function buildMenuCatalog(): MenuEntry[] {
  const groups: MenuEntry[][] = [[],[],[],[]];
  for (const [index,[protein,ingredient]] of proteins.entries()) {
    for (const [method,action,extras] of savoryMethods) {
      const name = title(`${protein} ${method}`);
      groups[0].push({name,category:'Món chính',price:99000+index*7000,chefRole:'savory',ingredients:parts([p(ingredient,220),...extras,p('Nước mắm',10,'ml'),p('Rau thơm',10)]),description:`${title(protein)} tươi được ${action}. Dùng nóng cùng rau thơm; một phần gồm 220 g ${protein}, gia vị được cân đối để giữ vị ngọt của nguyên liệu chính.`,imagePrompt:`Vietnamese dish ${name}: ${action}; main ingredient ${ingredient}; finished savory dish, garnished with fresh herbs.`});
    }
    for (const [vegetable,vegetableIngredient] of salads) {
      const name = title(`gỏi ${vegetable} ${protein}`);
      groups[1].push({name,category:'Khai vị',price:69000+index*4000,chefRole:'savory',ingredients:parts([p(ingredient,100),p(vegetableIngredient,120),p('Rau thơm',15),p('Đậu phộng',15),p('Chanh',20),p('Nước mắm',15,'ml'),p('Đường',8)]),description:`${title(protein)} được làm chín, để nguội rồi trộn cùng ${vegetable} thái miếng vừa ăn, rau thơm và đậu phộng rang. Nước trộn chanh, nước mắm và đường tạo vị chua ngọt thanh nhẹ.`,imagePrompt:`Vietnamese salad ${name}, cooked ${protein}, fresh ${vegetable}, herbs, roasted peanuts, light lime fish sauce dressing. No raw meat or raw seafood.`});
    }
  }
  for (const [index,[vegetable,ingredient]] of vegetables.entries()) for (const [method,action,extras] of veganMethods) {
    const name = title(`${vegetable} ${method}`);
    groups[2].push({name,category:'Món chay',price:59000+index*2000,chefRole:'vegetarian',ingredients:parts([p(ingredient,220),...extras,p('Muối',2),p('Dầu ăn',10,'ml')]),description:`${title(vegetable)} được sơ chế, ${action}, nêm nhẹ bằng gia vị thực vật. Phần ăn 220 g nguyên liệu chính, dùng nóng để cảm nhận vị ngọt và kết cấu riêng của ${vegetable}.`,imagePrompt:`Vietnamese vegan dish ${name}: ${action}, main ingredient ${ingredient}; no meat, seafood, eggs or fish sauce.`});
  }
  for (const [index,fruit] of fruits.entries()) for (const [format,action,extras] of desserts) {
    const name = `${format} ${fruit.toLocaleLowerCase('vi')}`;
    groups[3].push({name,category:'Tráng miệng',price:39000+index*2000,chefRole:'vegetarian',ingredients:parts([p(fruit,100),...extras,p('Đường',10)]),description:`${fruit} chín được chọn lọc để ${action}. Một phần sử dụng 100 g ${fruit.toLocaleLowerCase('vi')}, giữ hương thơm đặc trưng và vị ngọt vừa phải.`,imagePrompt:`Dessert ${name}, made from ${fruit}, preparation: ${action}. Serve in an appropriate individual dessert vessel; if beverage, use a glass.`});
  }
  return groups[0].flatMap((_,index) => groups.map(group => group[index]));
}
