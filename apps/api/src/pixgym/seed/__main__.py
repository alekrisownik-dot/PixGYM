from sqlalchemy import create_engine

from pixgym.core.config import get_settings
from pixgym.seed import seed
from pixgym.seed.catalog_data import EXERCISES
from pixgym.seed.programs_data import TEMPLATES


def main() -> None:
    engine = create_engine(get_settings().migrations_database_url)
    with engine.begin() as conn:
        seed(conn)
    print(f"seed: {len(EXERCISES)} ćwiczeń, {len(TEMPLATES)} szablonów planów")


if __name__ == "__main__":
    main()
