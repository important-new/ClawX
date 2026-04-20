/**
 * Amazon Selection Funnel Filter Metadata
 * Synchronized with common/path_utils.py labels.
 */

export const AMZ_FILTER_LABELS: Record<string, string> = {
  // SellerSprite Base Filtering
  "monthly_sales_min": "月均销量 >",
  "monthly_sales_max": "月均销量 <",
  "price_min": "价格 >",
  "price_max": "价格 <",
  "rating_min": "评分 >",
  "rating_max": "评分 <",
  "fba": "FBA 配送",
  "amz": "包含自营",
  "fbm": "FBM 模式",
  "listing_age": "新品周期 (月)",
  "seller_location": "卖家所在地",
  "seller_count_max": "最大卖家数",
  "review_rate_min": "留评率 >",
  "review_count_max": "总评论数 <",
  
  // Custom Deep Filtering
  "max_seller_reviews": "店铺评价数上限",
  "min_store_listing_count": "店铺最少商品数",
  "max_high_sales_ratio": "成熟产品占比上限",
  "max_launch_reviews": "上架时评论数限制",
  "max_3m_reviews": "3个月后评论上限",
  "min_3m_reviews": "3个月后评论下限",
  "review_jump_threshold": "评论跳涨阈值",
  "max_review_jumps": "允许评论跳涨次数",
  "max_min_ppc": "核心词最低竞价上限",
  "max_comp_reviews": "首页对标评价数限制",
  "s1_min_sales": "S1: 最低月销量",
  "s1_min_price": "S1: 最低售价",
  "s1_max_price": "S1: 最高售价",
  "s1_min_rating": "S1: 最低评分",
  "s1_max_new_months": "S1: 新品保护期(月)"
};
