import { MealDetail } from '@/components/meal-detail';

export default async function MealDetailPage({
  params,
}: {
  params: Promise<{ mealId: string }>;
}) {
  const { mealId } = await params;
  return <MealDetail mealId={mealId} />;
}
