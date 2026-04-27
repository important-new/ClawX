// Amazon 商品类别 → 佣金比例 (referral fee %)
// 数据来源: https://sellercentral.amazon.com/help/hub/reference/GTG4BAWSY39Z98Z3

export interface AmazonCategory {
  id: string;
  name: string;
  nameCn: string;
  referralRate: number;
}

export const AMAZON_CATEGORIES: AmazonCategory[] = [
  { id: 'electronics', name: 'Electronics', nameCn: '电子产品', referralRate: 0.08 },
  { id: 'computers', name: 'Computers', nameCn: '电脑', referralRate: 0.08 },
  { id: 'camera_photo', name: 'Camera & Photo', nameCn: '相机和摄影', referralRate: 0.08 },
  { id: 'cell_phones', name: 'Cell Phones & Accessories', nameCn: '手机及配件', referralRate: 0.08 },
  { id: 'beauty', name: 'Beauty & Personal Care', nameCn: '美妆个护', referralRate: 0.08 },
  { id: 'health', name: 'Health & Household', nameCn: '健康和家居', referralRate: 0.08 },
  { id: 'grocery', name: 'Grocery & Gourmet Food', nameCn: '食品', referralRate: 0.08 },
  { id: 'automotive', name: 'Automotive', nameCn: '汽车用品', referralRate: 0.12 },
  { id: 'industrial', name: 'Industrial & Scientific', nameCn: '工业和科学', referralRate: 0.12 },
  { id: 'home_kitchen', name: 'Home & Kitchen', nameCn: '家居和厨房', referralRate: 0.15 },
  { id: 'kitchen_dining', name: 'Kitchen & Dining', nameCn: '厨房和餐饮', referralRate: 0.15 },
  { id: 'sports', name: 'Sports & Outdoors', nameCn: '运动和户外', referralRate: 0.15 },
  { id: 'toys', name: 'Toys & Games', nameCn: '玩具和游戏', referralRate: 0.15 },
  { id: 'tools', name: 'Tools & Home Improvement', nameCn: '工具和家装', referralRate: 0.15 },
  { id: 'pet', name: 'Pet Supplies', nameCn: '宠物用品', referralRate: 0.15 },
  { id: 'office', name: 'Office Products', nameCn: '办公用品', referralRate: 0.15 },
  { id: 'patio', name: 'Patio, Lawn & Garden', nameCn: '庭院和花园', referralRate: 0.15 },
  { id: 'baby', name: 'Baby', nameCn: '婴幼儿', referralRate: 0.15 },
  { id: 'clothing', name: 'Clothing, Shoes & Jewelry', nameCn: '服装鞋靴珠宝', referralRate: 0.17 },
  { id: 'watches', name: 'Watches', nameCn: '手表', referralRate: 0.16 },
  { id: 'furniture', name: 'Furniture', nameCn: '家具', referralRate: 0.15 },
  { id: 'appliances', name: 'Appliances', nameCn: '家电', referralRate: 0.15 },
  { id: 'arts', name: 'Arts, Crafts & Sewing', nameCn: '手工艺品', referralRate: 0.15 },
  { id: 'musical', name: 'Musical Instruments', nameCn: '乐器', referralRate: 0.15 },
  { id: 'garden', name: 'Garden & Outdoor', nameCn: '花园和户外', referralRate: 0.15 },
];

const DEFAULT_REFERRAL_RATE = 0.15;

export function getReferralRate(categoryId: string): number {
  const cat = AMAZON_CATEGORIES.find(c => c.id === categoryId);
  return cat?.referralRate ?? DEFAULT_REFERRAL_RATE;
}

// 从 BSR 类目名称推断 categoryId (用于批量计算)
export function inferCategoryId(bsrCategoryName: string): string {
  if (!bsrCategoryName) return 'home_kitchen';
  const lower = bsrCategoryName.toLowerCase();
  for (const cat of AMAZON_CATEGORIES) {
    if (lower.includes(cat.name.toLowerCase())) return cat.id;
  }
  // 部分匹配
  if (lower.includes('electronic') || lower.includes('audio') || lower.includes('video')) return 'electronics';
  if (lower.includes('home') && lower.includes('kitchen')) return 'home_kitchen';
  if (lower.includes('tool')) return 'tools';
  if (lower.includes('sport') || lower.includes('outdoor')) return 'sports';
  if (lower.includes('health') || lower.includes('household')) return 'health';
  if (lower.includes('beauty') || lower.includes('personal care')) return 'beauty';
  if (lower.includes('auto')) return 'automotive';
  if (lower.includes('industr')) return 'industrial';
  if (lower.includes('pet')) return 'pet';
  if (lower.includes('cloth') || lower.includes('shoe') || lower.includes('jewelry')) return 'clothing';
  if (lower.includes('toy') || lower.includes('game')) return 'toys';
  if (lower.includes('office')) return 'office';
  if (lower.includes('patio') || lower.includes('lawn') || lower.includes('garden')) return 'patio';
  if (lower.includes('grocer') || lower.includes('food')) return 'grocery';
  if (lower.includes('baby')) return 'baby';
  return 'home_kitchen';
}
