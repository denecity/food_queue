# TODO

## Ideas

### Ingredient substitution system

Decide whether to substitute an ingredient when a viable substitution is available.

- **Network:** each ingredient is connected to other ingredients, or combinations of
  ingredients, that could stand in for it.
- **Each connection has:**
  - a substitution viability factor (how good the swap is)
  - a conversion constant (how much of the substitute replaces how much of the original)
- **Combinations count:** for some recipes 1 l of milk can be replaced by 0.5 l of cream
  plus water.
- **Shopping list:** a substitution can always be chosen on an item.
- **Pantry hint:** if a viable substitution is already in the pantry, the item gets a
  yellow dashed outline.
