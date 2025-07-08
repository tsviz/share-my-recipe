-- Migration for AI-powered recipe enhancement features
-- Phase 1: Nutritional Analysis

-- Create recipe_nutrition table for storing nutritional information
<changeSet id="16" author="ai-features">
    <comment>Adding nutritional analysis capabilities for AI-powered recipe enhancement</comment>
    
    <!-- Recipe nutrition information table -->
    <createTable tableName="recipe_nutrition">
        <column name="id" type="VARCHAR(36)" defaultValueComputed="gen_random_uuid()">
            <constraints primaryKey="true" nullable="false"/>
        </column>
        <column name="recipe_id" type="VARCHAR(36)">
            <constraints nullable="false" foreignKeyName="fk_nutrition_recipe" references="recipes(id)" deleteCascade="true"/>
        </column>
        <column name="serving_size" type="INTEGER" defaultValue="1">
            <constraints nullable="false"/>
        </column>
        <column name="calories" type="DECIMAL(8,2)"/>
        <column name="protein" type="DECIMAL(8,2)"/>
        <column name="carbs" type="DECIMAL(8,2)"/>
        <column name="fat" type="DECIMAL(8,2)"/>
        <column name="fiber" type="DECIMAL(8,2)"/>
        <column name="sugar" type="DECIMAL(8,2)"/>
        <column name="sodium" type="DECIMAL(8,2)"/>
        <column name="cholesterol" type="DECIMAL(8,2)"/>
        <column name="vitamin_c" type="DECIMAL(8,2)"/>
        <column name="calcium" type="DECIMAL(8,2)"/>
        <column name="iron" type="DECIMAL(8,2)"/>
        <column name="potassium" type="DECIMAL(8,2)"/>
        <column name="calculated_at" type="TIMESTAMP" defaultValueComputed="CURRENT_TIMESTAMP">
            <constraints nullable="false"/>
        </column>
        <column name="data_source" type="VARCHAR(100)" defaultValue="AI_CALCULATED"/>
        <column name="confidence_score" type="DECIMAL(3,2)" defaultValue="0.75"/>
    </createTable>
    
    <!-- Add unique constraint to ensure one nutrition record per recipe -->
    <addUniqueConstraint tableName="recipe_nutrition" columnNames="recipe_id" constraintName="unique_recipe_nutrition"/>
    
    <!-- Add nutrition flags to recipes table -->
    <addColumn tableName="recipes">
        <column name="nutrition_calculated" type="BOOLEAN" defaultValueBoolean="false">
            <constraints nullable="false"/>
        </column>
        <column name="ai_generated" type="BOOLEAN" defaultValueBoolean="false">
            <constraints nullable="false"/>
        </column>
    </addColumn>
    
    <!-- Create index for faster nutrition lookups -->
    <sql>
        CREATE INDEX IF NOT EXISTS idx_recipe_nutrition_recipe_id ON recipe_nutrition(recipe_id);
        CREATE INDEX IF NOT EXISTS idx_recipes_nutrition_calculated ON recipes(nutrition_calculated);
        CREATE INDEX IF NOT EXISTS idx_recipes_ai_generated ON recipes(ai_generated);
    </sql>
    
    <rollback>
        DROP INDEX IF EXISTS idx_recipes_ai_generated;
        DROP INDEX IF EXISTS idx_recipes_nutrition_calculated;
        DROP INDEX IF EXISTS idx_recipe_nutrition_recipe_id;
        ALTER TABLE recipes DROP COLUMN IF EXISTS ai_generated;
        ALTER TABLE recipes DROP COLUMN IF EXISTS nutrition_calculated;
        DROP TABLE IF EXISTS recipe_nutrition;
    </rollback>
</changeSet>