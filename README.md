# Georgian Web Test

Веб-приложение с тестами для гражданства Грузии: грузинский язык, история и право.

## Запуск

```bash
cd /Users/veniamin/Documents/Codex/2026-05-11/github/georgian-web
python3 app.py
```

После запуска откройте:

```text
http://127.0.0.1:8000
```

## Публикация в интернет через GitHub Pages

```bash
python3 export_static.py
```

Команда создаст папку `docs`. В GitHub Pages выберите публикацию из ветки `main` и папки `/docs`.

## Встраивание в Tilda

Инструкция и готовый iframe-код лежат в [TILDA_SETUP.md](TILDA_SETUP.md).

Коротко:

```text
https://drbenjaminbk-ai.github.io/georgian-web/?embed=1
```

Код для HTML-блока Tilda:

```text
static/tilda-iframe-snippet.html
```

## Что внутри

- `app.py` - маленький Python-сервер без Telegram-токена.
- `export_static.py` - сборка статической версии для GitHub Pages.
- `docs/` - готовый сайт для публикации.
- `data/questions.pdf` - PDF, из которого парсятся вопросы.
- `data/hints.json` - подсказки и правила.
- `static/` - веб-страница теста.
- `static/tilda-iframe-snippet.html` - готовая вставка для HTML-блока Tilda.

## Важно

В исходном Telegram-файле токен бота записан прямо в коде. Перед публикацией проекта на GitHub лучше перевыпустить токен у BotFather и хранить новый токен в `.env`, а не в `.py` файле.
