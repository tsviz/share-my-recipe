-- Populate glossary so 'vegetables' category expands to all common vegetable ingredients
-- Insert 'vegetables' as a glossary term if not present
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'vegetables', 'category'
WHERE NOT EXISTS (
    SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'vegetables'
);

-- Insert each vegetable ingredient as a glossary term if not present
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'carrot', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'carrot');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'spinach', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'spinach');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'peas', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'peas');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'potato', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'potato');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'tomato', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'tomato');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'onion', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'onion');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'garlic', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'garlic');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'broccoli', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'broccoli');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'cauliflower', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'cauliflower');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'bell pepper', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'bell pepper');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'red pepper', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'red pepper');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'green pepper', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'green pepper');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'yellow pepper', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'yellow pepper');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'zucchini', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'zucchini');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'eggplant', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'eggplant');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'cucumber', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'cucumber');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'lettuce', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'lettuce');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'cabbage', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'cabbage');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'kale', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'kale');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'arugula', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'arugula');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'celery', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'celery');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'radish', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'radish');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'turnip', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'turnip');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'parsnip', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'parsnip');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'beet', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'beet');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'sweet potato', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'sweet potato');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'yam', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'yam');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'pumpkin', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'pumpkin');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'squash', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'squash');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'asparagus', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'asparagus');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'artichoke', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'artichoke');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'leek', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'leek');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'shallot', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'shallot');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'scallion', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'scallion');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'fennel', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'fennel');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'okra', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'okra');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'mushroom', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'mushroom');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'corn', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'corn');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'chard', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'chard');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'endive', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'endive');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'bok choy', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'bok choy');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'collard greens', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'collard greens');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'mustard greens', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'mustard greens');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'dandelion greens', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'dandelion greens');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'watercress', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'watercress');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'jerusalem artichoke', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'jerusalem artichoke');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'rutabaga', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'rutabaga');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'horseradish', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'horseradish');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'jicama', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'jicama');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'daikon', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'daikon');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'bamboo shoots', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'bamboo shoots');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'lotus root', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'lotus root');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'snow pea', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'snow pea');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'snap pea', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'snap pea');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'mung bean sprout', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'mung bean sprout');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'bean sprout', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'bean sprout');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'seaweed', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'seaweed');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'broccolini', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'broccolini');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'romanesco', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'romanesco');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'kohlrabi', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'kohlrabi');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'cress', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'cress');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'mizuna', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'mizuna');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'tatsoi', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'tatsoi');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'chayote', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'chayote');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'fiddlehead', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'fiddlehead');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'salsify', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'salsify');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'taro', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'taro');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'malanga', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'malanga');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'cassava', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'cassava');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'yuca', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'yuca');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'edamame', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'edamame');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'soybean', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'soybean');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'yardlong bean', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'yardlong bean');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'fava bean', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'fava bean');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'broad bean', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'broad bean');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'lima bean', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'lima bean');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'navy bean', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'navy bean');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'black bean', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'black bean');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'adzuki bean', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'adzuki bean');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'mung bean', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'mung bean');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'chickpea', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'chickpea');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'garbanzo bean', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'garbanzo bean');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'lentil', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'lentil');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'pigeon pea', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'pigeon pea');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'butternut squash', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'butternut squash');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'acorn squash', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'acorn squash');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'spaghetti squash', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'spaghetti squash');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'pattypan squash', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'pattypan squash');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'delicata squash', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'delicata squash');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'turban squash', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'turban squash');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'tat soi', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'tat soi');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'purslane', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'purslane');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'sorrel', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'sorrel');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'amaranth', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'amaranth');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'samphire', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'samphire');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'nopales', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'nopales');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'hearts of palm', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'hearts of palm');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'celtuce', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'celtuce');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'radicchio', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'radicchio');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'escarole', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'escarole');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'frisée', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'frisée');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'pea shoot', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'pea shoot');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'pea tendril', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'pea tendril');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'spring onion', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'spring onion');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'ramps', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'ramps');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'wild garlic', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'wild garlic');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'scorzonera', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'scorzonera');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'cardoon', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'cardoon');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'wasabi', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'wasabi');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'galangal', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'galangal');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'lemongrass', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'lemongrass');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'tinda', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'tinda');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'ivy gourd', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'ivy gourd');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'bitter melon', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'bitter melon');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'snake gourd', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'snake gourd');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'ash gourd', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'ash gourd');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'wax gourd', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'wax gourd');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'turmeric root', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'turmeric root');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'ginger root', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'ginger root');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'parsley root', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'parsley root');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'celeriac', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'celeriac');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'sunchoke', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'sunchoke');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'yam bean', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'yam bean');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'lotus stem', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'lotus stem');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'burdock root', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'burdock root');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'tamarillo', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'tamarillo');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'tomatillo', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'tomatillo');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'chayote squash', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'chayote squash');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'pepino', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'pepino');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'cucamelon', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'cucamelon');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'gai lan', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'gai lan');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'yu choy', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'yu choy');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'tat soi', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'tat soi');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'mizuna', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'mizuna');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'komatsuna', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'komatsuna');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'pak choi', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'pak choi');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'chinese broccoli', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'chinese broccoli');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'chinese cabbage', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'chinese cabbage');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'napa cabbage', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'napa cabbage');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'savoy cabbage', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'savoy cabbage');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'red cabbage', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'red cabbage');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'white radish', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'white radish');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'purple carrot', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'purple carrot');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'yellow carrot', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'yellow carrot');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'baby carrot', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'baby carrot');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'baby corn', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'baby corn');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'mini sweet pepper', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'mini sweet pepper');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'shishito pepper', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'shishito pepper');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'padrón pepper', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'padrón pepper');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'jalapeño', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'jalapeño');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'serrano', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'serrano');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'habanero', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'habanero');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'poblano', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'poblano');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'anaheim pepper', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'anaheim pepper');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'cubanelle pepper', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'cubanelle pepper');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'banana pepper', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'banana pepper');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'pepperoncini', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'pepperoncini');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'jalapeno', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'jalapeno');
INSERT INTO glossary_terms (standard_term, term_type)
SELECT 'chili pepper', 'ingredient' WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE LOWER(standard_term) = 'chili pepper');

-- Map 'vegetables' to each ingredient in glossary_related_terms
INSERT INTO glossary_related_terms (source_term_id, related_term_id, relation_type)
SELECT st.id, it.id, 'includes_item'
FROM glossary_terms st, glossary_terms it
WHERE LOWER(st.standard_term) = 'vegetables'
  AND LOWER(it.standard_term) IN (
    'carrot','spinach','peas','potato','tomato','onion','garlic','broccoli','cauliflower','bell pepper','red pepper','green pepper','yellow pepper','zucchini','eggplant','cucumber','lettuce','cabbage','kale','arugula','celery','radish','turnip','parsnip','beet','sweet potato','yam','pumpkin','squash','asparagus','artichoke','leek','shallot','scallion','fennel','okra','mushroom','corn','chard','endive','bok choy','collard greens','mustard greens','dandelion greens','watercress','jerusalem artichoke','rutabaga','horseradish','jicama','daikon','bamboo shoots','lotus root','snow pea','snap pea','mung bean sprout','bean sprout','seaweed','broccolini','romanesco','kohlrabi','cress','mizuna','tatsoi','chayote','fiddlehead','salsify','taro','malanga','cassava','yuca','edamame','soybean','yardlong bean','fava bean','broad bean','lima bean','navy bean','black bean','adzuki bean','mung bean','chickpea','garbanzo bean','lentil','pigeon pea','butternut squash','acorn squash','spaghetti squash','pattypan squash','delicata squash','turban squash','tat soi','purslane','sorrel','amaranth','samphire','nopales','hearts of palm','celtuce','radicchio','escarole','frisée','pea shoot','pea tendril','spring onion','ramps','wild garlic','scorzonera','cardoon','wasabi','galangal','lemongrass','tinda','ivy gourd','bitter melon','snake gourd','ash gourd','wax gourd','turmeric root','ginger root','parsley root','celeriac','sunchoke','yam bean','lotus stem','burdock root','tamarillo','tomatillo','chayote squash','pepino','cucamelon','gai lan','yu choy','tat soi','mizuna','komatsuna','pak choi','chinese broccoli','chinese cabbage','napa cabbage','savoy cabbage','red cabbage','white radish','purple carrot','yellow carrot','baby carrot','baby corn','mini sweet pepper','shishito pepper','padrón pepper','jalapeño','serrano','habanero','poblano','anaheim pepper','cubanelle pepper','banana pepper','pepperoncini','jalapeno','chili pepper'
  )
  AND NOT EXISTS (
    SELECT 1 FROM glossary_related_terms grt
    WHERE grt.source_term_id = st.id AND grt.related_term_id = it.id AND grt.relation_type = 'includes_item'
  );
