# ШІ-ревʼюер PR

Скрипт, який на кожен PR питає модель Together AI про проблеми в diff, відсіює непідтверджене, додає правила без моделі
й лишає один коментар.

**Зараз вимкнено:** workflow `ai-review.yml` не стартує на PR. Як увімкнути знову: [docs/ai-review.md](../../docs/ai-review.md).

- Будова і схема потоку: [docs/ai-review-design.md](../../docs/ai-review-design.md)
- Увімкнення, налаштування, запуск: [docs/ai-review.md](../../docs/ai-review.md)
- Вимірювання якості: [eval/README.md](eval/README.md)

```bash
python3 -m unittest discover -s tools/ai-review   # тести, без ключа й мережі
python3 tools/ai-review/eval/check_rules.py       # правила без моделі на кейсах вимірювання
```

| Файл | Що в ньому |
|---|---|
| `review.py` | конвеєр ревʼю |
| `checks.py` | правила без моделі |
| `rules.md` | правила проєкту для моделі |
| `eval/` | вимірювання якості |
| `test_*.py`, `fakes.py` | тести й підставний API |
