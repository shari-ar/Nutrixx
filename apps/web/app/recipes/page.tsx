import { PageHeader } from '@/components/page-header';
import { RecipeWorkspace } from '@/components/recipe-workspace';

export default function RecipesPage() {
  return (
    <div className="py-12 sm:py-16">
      <PageHeader
        description="Build reusable recipes from exact food or recipe references, preserve yield, and publish every correction as a new immutable version."
        eyebrow="Local recipe knowledge"
        title="Recipes and yields"
      />
      <div className="mt-10">
        <RecipeWorkspace />
      </div>
    </div>
  );
}
