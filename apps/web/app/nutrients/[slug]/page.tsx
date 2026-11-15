import { NutrientFoodRanking } from '@/components/nutrient-food-ranking';

export default async function NutrientFoodRankingPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <NutrientFoodRanking slug={slug} />;
}
