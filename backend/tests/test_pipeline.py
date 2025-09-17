import os
import pytest
from app.services.pipeline import Pipeline


def test_pipeline_steps_return_dicts():
    p = Pipeline()
    text = "FADE IN: A test script"
    assert isinstance(p.step_script_preprocess(text), dict)
    assert isinstance(p.step_core_extraction(text), dict)
    assert isinstance(p.step_character_bible(text), dict)
    assert isinstance(p.step_market_adaptation({}, 'Mumbai', ['Disney+ Hotstar']), dict)
    assert isinstance(p.step_package_assembly({}), dict)
    assert isinstance(p.step_final_package({}), dict)


@pytest.mark.skipif(not os.getenv('SUPABASE_URL') or not os.getenv('SUPABASE_SERVICE_ROLE_KEY'), reason='Supabase env not set')
def test_rls_tables_crud_smoke():
    # Optional smoke test to ensure tables exist; requires service role
    from supabase import create_client
    url = os.environ['SUPABASE_URL']
    key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    client = create_client(url, key)
    # Ensure trends table selectable
    res = client.table('indian_market_trends').select('id').limit(1).execute()
    assert res is not None

