-- Migration for AI-powered ingredient substitutions
-- Phase 2: Smart Ingredient Substitutions

-- Create ingredient_substitutions table for storing substitution patterns
<changeSet id="17" author="ai-features">
    <comment>Adding smart ingredient substitutions for AI-powered recipe enhancement</comment>
    
    <!-- Ingredient substitutions table -->
    <createTable tableName="ingredient_substitutions">
        <column name="id" type="VARCHAR(36)" defaultValueComputed="gen_random_uuid()">
            <constraints primaryKey="true" nullable="false"/>
        </column>
        <column name="original_ingredient" type="VARCHAR(255)">
            <constraints nullable="false"/>
        </column>
        <column name="substitute_ingredient" type="VARCHAR(255)">
            <constraints nullable="false"/>
        </column>
        <column name="conversion_ratio" type="VARCHAR(100)" defaultValue="1:1">
            <constraints nullable="false"/>
        </column>
        <column name="substitution_context" type="VARCHAR(50)" defaultValue="general">
            <!-- Values: 'baking', 'cooking', 'dessert', 'garnish', 'general' -->
            <constraints nullable="false"/>
        </column>
        <column name="dietary_tags" type="TEXT">
            <!-- JSON array of dietary tags: ["vegan", "gluten-free", "keto", etc.] -->
        </column>
        <column name="confidence_score" type="DECIMAL(3,2)" defaultValue="0.8">
            <constraints nullable="false"/>
        </column>
        <column name="usage_count" type="INTEGER" defaultValue="0">
            <constraints nullable="false"/>
        </column>
        <column name="success_rate" type="DECIMAL(3,2)" defaultValue="0.8">
            <constraints nullable="false"/>
        </column>
        <column name="created_at" type="TIMESTAMP" defaultValueComputed="CURRENT_TIMESTAMP">
            <constraints nullable="false"/>
        </column>
        <column name="updated_at" type="TIMESTAMP" defaultValueComputed="CURRENT_TIMESTAMP">
            <constraints nullable="false"/>
        </column>
        <column name="created_by" type="VARCHAR(50)" defaultValue="AI_SYSTEM">
            <!-- 'AI_SYSTEM' or 'USER_FEEDBACK' -->
            <constraints nullable="false"/>
        </column>
    </createTable>
    
    <!-- Create indexes for faster substitution lookups -->
    <sql>
        CREATE INDEX IF NOT EXISTS idx_ingredient_substitutions_original ON ingredient_substitutions(original_ingredient);
        CREATE INDEX IF NOT EXISTS idx_ingredient_substitutions_substitute ON ingredient_substitutions(substitute_ingredient);
        CREATE INDEX IF NOT EXISTS idx_ingredient_substitutions_context ON ingredient_substitutions(substitution_context);
        CREATE INDEX IF NOT EXISTS idx_ingredient_substitutions_dietary ON ingredient_substitutions USING GIN((dietary_tags::jsonb));
    </sql>
    
    <!-- Insert some common substitution patterns -->
    <insert tableName="ingredient_substitutions">
        <column name="original_ingredient" value="butter"/>
        <column name="substitute_ingredient" value="vegetable oil"/>
        <column name="conversion_ratio" value="1 cup butter = 3/4 cup oil"/>
        <column name="substitution_context" value="baking"/>
        <column name="dietary_tags" value='["dairy-free"]'/>
        <column name="confidence_score" value="0.85"/>
    </insert>
    
    <insert tableName="ingredient_substitutions">
        <column name="original_ingredient" value="butter"/>
        <column name="substitute_ingredient" value="applesauce"/>
        <column name="conversion_ratio" value="1 cup butter = 1/2 cup applesauce"/>
        <column name="substitution_context" value="baking"/>
        <column name="dietary_tags" value='["dairy-free", "lower-fat"]'/>
        <column name="confidence_score" value="0.75"/>
    </insert>
    
    <insert tableName="ingredient_substitutions">
        <column name="original_ingredient" value="eggs"/>
        <column name="substitute_ingredient" value="flax eggs"/>
        <column name="conversion_ratio" value="1 egg = 1 tbsp ground flaxseed + 3 tbsp water"/>
        <column name="substitution_context" value="baking"/>
        <column name="dietary_tags" value='["vegan", "egg-free"]'/>
        <column name="confidence_score" value="0.8"/>
    </insert>
    
    <insert tableName="ingredient_substitutions">
        <column name="original_ingredient" value="all-purpose flour"/>
        <column name="substitute_ingredient" value="almond flour"/>
        <column name="conversion_ratio" value="1 cup all-purpose = 1/4 cup almond flour"/>
        <column name="substitution_context" value="baking"/>
        <column name="dietary_tags" value='["gluten-free", "keto", "low-carb"]'/>
        <column name="confidence_score" value="0.7"/>
    </insert>
    
    <insert tableName="ingredient_substitutions">
        <column name="original_ingredient" value="heavy cream"/>
        <column name="substitute_ingredient" value="coconut cream"/>
        <column name="conversion_ratio" value="1:1"/>
        <column name="substitution_context" value="cooking"/>
        <column name="dietary_tags" value='["dairy-free", "vegan"]'/>
        <column name="confidence_score" value="0.9"/>
    </insert>
    
    <insert tableName="ingredient_substitutions">
        <column name="original_ingredient" value="sugar"/>
        <column name="substitute_ingredient" value="stevia"/>
        <column name="conversion_ratio" value="1 cup sugar = 1 tsp stevia"/>
        <column name="substitution_context" value="general"/>
        <column name="dietary_tags" value='["sugar-free", "keto", "diabetic-friendly"]'/>
        <column name="confidence_score" value="0.75"/>
    </insert>
    
    <rollback>
        DROP INDEX IF EXISTS idx_ingredient_substitutions_dietary;
        DROP INDEX IF EXISTS idx_ingredient_substitutions_context;
        DROP INDEX IF EXISTS idx_ingredient_substitutions_substitute;
        DROP INDEX IF EXISTS idx_ingredient_substitutions_original;
        DROP TABLE IF EXISTS ingredient_substitutions;
    </rollback>
</changeSet>