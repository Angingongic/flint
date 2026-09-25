import type {TableCard} from "./structured";
export type ImageCropRect={x:number;y:number;width:number;height:number};
export type ImageLayout={x:number;y:number;width:number;crop?:ImageCropRect};
export const defaultImageLayout:ImageLayout={x:0,y:0,width:120};
export function moveTableImage(value:TableCard,from:string,to:string,layout:ImageLayout):TableCard {
  if(!value.images?.[from] || from!==to&&value.images[to])return value;
  const legal=value.rows.some(r=>value.columns.some(c=>`${r.id}:${c.id}`===to));
  if(!legal)return value;
  const images={...value.images},imageLayouts={...value.imageLayouts};
  const source=images[from];delete images[from];delete imageLayouts[from];
  images[to]=source;imageLayouts[to]={...layout,x:Math.max(0,Math.min(640,layout.x)),y:Math.max(0,Math.min(640,layout.y)),width:Math.max(24,Math.min(640,layout.width))};
  return {...value,images,imageLayouts};
}
