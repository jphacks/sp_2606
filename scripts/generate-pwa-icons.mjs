import sharp from 'sharp';
const source = 'public/costep-logo.png';
const {width,height} = await sharp(source).metadata();
const mark = await sharp(source).extract({left:Math.round(width*.105),top:Math.round(height*.255),width:Math.round(width*.245),height:Math.round(height*.445)}).png().toBuffer();
for (const [name,size,ratio] of [['icon-192.png',192,.78],['icon-512.png',512,.78],['maskable-512.png',512,.6],['apple-touch-icon.png',180,.78]]) {
 const content = await sharp(mark).resize(Math.round(size*ratio),Math.round(size*ratio),{fit:'contain',background:'#ffffff'}).png().toBuffer();
 await sharp({create:{width:size,height:size,channels:3,background:'#ffffff'}}).composite([{input:content,gravity:'centre'}]).png().toFile('public/icons/'+name);
}
