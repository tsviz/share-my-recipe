// src/models/mealPlan.ts
// Data models for meal planning feature

export interface MealPlan {
  id: string;
  user_id: string;
  name: string;
  start_date: string;
  end_date: string;
  total_calories: number;
  created_at: string;
  updated_at: string;
}

export interface MealPlanItem {
  id: string;
  meal_plan_id: string;
  recipe_id: string;
  meal_date: string;
  meal_time: string;
  servings: number;
  created_at: string;
  updated_at: string;
}

export interface ShoppingList {
  id: string;
  meal_plan_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ShoppingListItem {
  id: string;
  shopping_list_id: string;
  ingredient_id: string;
  quantity: string;
  unit: string | null;
  checked: boolean;
  created_at: string;
  updated_at: string;
}
