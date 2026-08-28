# Lambda container image for agents/lambda_handler.py.
#
# Dependencies are installed from [project.dependencies] in pyproject.toml
# (no separate requirements.txt to keep in sync). Source is COPYed directly
# into LAMBDA_TASK_ROOT rather than `pip install .` — the project declares
# no package_data/MANIFEST.in, so a real install would silently drop
# agents/prompts/*.md and the core/*.json files; a direct copy keeps them at
# the exact relative paths the code already expects.

FROM public.ecr.aws/lambda/python:3.12

COPY pyproject.toml ./
RUN python -c "import tomllib; deps=tomllib.load(open('pyproject.toml','rb'))['project']['dependencies']; print('\n'.join(deps))" > requirements.txt \
    && pip install --no-cache-dir -r requirements.txt \
    && rm requirements.txt pyproject.toml

COPY agents ${LAMBDA_TASK_ROOT}/agents
COPY core ${LAMBDA_TASK_ROOT}/core
COPY storage ${LAMBDA_TASK_ROOT}/storage

CMD ["agents.lambda_handler.handler"]
