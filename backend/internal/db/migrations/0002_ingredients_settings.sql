-- Structured ingredient amounts + numeric servings, plus editable legal text.

ALTER TABLE recipes ADD COLUMN servings_count INTEGER NOT NULL DEFAULT 0;
UPDATE recipes SET servings_count = CAST(servings AS INTEGER);

-- Convert ingredient string arrays into {amount, unit, name} objects.
UPDATE recipes SET ingredients = COALESCE((
  SELECT json_group_array(json_object('amount', 0, 'unit', '', 'name', je.value))
  FROM json_each(recipes.ingredients) je
), '[]');

ALTER TABLE recipes DROP COLUMN servings;

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
