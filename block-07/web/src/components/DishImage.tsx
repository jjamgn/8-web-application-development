import { useState, type ImgHTMLAttributes } from 'react';
import { imageSource, missingDishImage } from '../config/resources';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> & { imageUrl?: string; imagePath?: string };
export default function DishImage({ imageUrl, imagePath, alt = '', ...props }: Props) {
  const source = imageSource(imageUrl, imagePath);
  // Track the failed URL rather than permanently replacing the DOM src. A new
  // API URL must be attempted even if a previous image failed on this component.
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const missing = source === missingDishImage || failedSource === source;
  return <img {...props} src={missing ? missingDishImage : source} alt={missing && alt ? `${alt} — ảnh chưa khả dụng` : alt} title={missing ? 'Ảnh món ăn chưa khả dụng' : props.title} onError={() => { if (!missing) setFailedSource(source); }} />;
}
