"""Draft 2020-12 contract boundaries and operational skill result validation."""

from copy import deepcopy
import json
from pathlib import Path
import unittest

from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource
import yaml

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / 'contracts'
SCHEMAS = CONTRACTS / 'schemas'
RUN_ID = '123e4567-e89b-42d3-a456-426614174000'
TRACE_ID = '1' * 32
NOW = '2026-10-05T12:00:00Z'


def validator(path):
    registry = Registry().with_resources(
        (file.as_uri(), Resource.from_contents(json.loads(file.read_text())))
        for file in CONTRACTS.rglob('*.schema.json')
    )
    schema = {'$ref': path.as_uri()}
    return Draft202012Validator(schema, registry=registry, format_checker=FormatChecker())


class BlueprintContractsTest(unittest.TestCase):
    def test_all_contract_and_skill_schemas_are_valid(self):
        paths = list(CONTRACTS.rglob('*.schema.json'))
        paths += list((ROOT / '.agents/skills/ops').rglob('*.schema.json'))
        for path in paths:
            with self.subTest(path=path):
                Draft202012Validator.check_schema(json.loads(path.read_text()))

    def test_existing_source_descriptors_remain_valid(self):
        source_validator = validator(SCHEMAS / 'source.v1.schema.json')
        for path in [CONTRACTS / 'source-descriptor.example.json', *sorted((CONTRACTS / 'source-descriptors').glob('*.json'))]:
            with self.subTest(path=path):
                source_validator.validate(json.loads(path.read_text()))

    def test_source_extensions_reject_invalid_permissions_evidence_and_streams(self):
        source = json.loads((CONTRACTS / 'source-descriptor.example.json').read_text())
        source.update({
            'verification_level': 'sample_tested',
            'evidence': [{'verification_level': 'sample_tested', 'uri': 'https://example.org/docs', 'checked_at': NOW, 'finding': 'Bounded sample passed'}],
            'streams': [{'name': 'articles', 'record_type': 'document', 'primary_key': ['id'], 'cursor_field': 'updated_at'}],
            'agent_permissions': {'read': ['raw/**'], 'write': ['staging/**'], 'delete': False, 'shell': False},
        })
        v = validator(SCHEMAS / 'source.v1.schema.json')
        v.validate(source)
        mutations = [
            lambda x: x['agent_permissions'].update(shell='false'),
            lambda x: x['agent_permissions'].update(execute=True),
            lambda x: x['evidence'][0].update(checked_at='yesterday'),
            lambda x: x['evidence'][0].update(verification_level='trusted'),
            lambda x: x['streams'][0].update(primary_key=[]),
            lambda x: x['pagination'].update(checkpoint_after_durable_commit=False),
        ]
        for mutate in mutations:
            instance = deepcopy(source)
            mutate(instance)
            self.assertFalse(v.is_valid(instance))

    def test_released_dataset_requires_every_gate_and_review(self):
        release = {
            'schema_version': 'dataset-release.v1', 'snapshot_id': 'snapshot-1',
            'dataset_id': 'turkish-corpus', 'version': 'v1.0.0', 'run_id': RUN_ID,
            'trace_id': TRACE_ID, 'manifest_uri': 'file:///tmp/manifest.json',
            'release_state': 'released', 'gates': {name: True for name in ['schema', 'quality', 'privacy', 'contamination', 'rights']},
            'reviewed_by': 'reviewer-1', 'reviewed_at': NOW, 'created_at': NOW,
        }
        v = validator(SCHEMAS / 'dataset-release.v1.schema.json')
        v.validate(release)
        for gate in release['gates']:
            instance = deepcopy(release)
            instance['gates'][gate] = False
            self.assertFalse(v.is_valid(instance), gate)
        for field in ['reviewed_by', 'reviewed_at']:
            instance = deepcopy(release)
            del instance[field]
            self.assertFalse(v.is_valid(instance), field)
        candidate = deepcopy(release)
        candidate.update(release_state='candidate')
        candidate['gates']['rights'] = False
        del candidate['reviewed_at']
        del candidate['reviewed_by']
        v.validate(candidate)

    def test_document_requires_occurrences_and_approved_rights_evidence(self):
        doc = {
            'schema_version': 'document.v1', 'document_id': 'a' * 64,
            'canonicalization_version': 'nfkc-whitespace-v1', 'text': 'Örnek metin',
            'language': 'tr', 'pii_status': 'unchecked', 'split': 'unassigned',
            'rights': {'status': 'unknown'},
            'occurrences': [{'source_id': 'example', 'source_record_id': '42', 'source_uri': 'https://example.org/42', 'acquired_at': NOW, 'raw_artifact_id': 'raw-42'}],
        }
        v = validator(SCHEMAS / 'document.v1.schema.json')
        v.validate(doc)
        for replacement in [{'document_id': 'not-a-hash'}, {'occurrences': []}, {'pii_status': 'safe'}, {'rights': {'status': 'approved'}}]:
            self.assertFalse(v.is_valid({**doc, **replacement}))
        doc['rights'] = {'status': 'approved', 'license': 'CC0-1.0', 'evidence_uri': 'https://example.org/license', 'reviewed_at': NOW, 'allowed_purposes': ['training']}
        v.validate(doc)

    def test_manifest_rejects_missing_config_and_invalid_run_id(self):
        manifest = {
            'schema_version': 'manifest.v1', 'manifest_id': 'manifest-1',
            'run_id': RUN_ID, 'trace_id': TRACE_ID, 'pipeline': 'example',
            'started_at': NOW, 'finished_at': NOW, 'status': 'success',
            'agent_id': 'worker-1', 'agent_version': '1.0.0', 'config_sha256': 'a' * 64,
            'counts': {'records': 10}, 'quality': {'pass_rate': 1.0},
            'checkpoint_committed': True, 'errors': [], 'artifacts': [], 'created_at': NOW,
        }
        v = validator(SCHEMAS / 'manifest.v1.schema.json')
        v.validate(manifest)
        for field, bad in [('run_id', 'not-a-uuid'), ('trace_id', '0' * 32), ('config_sha256', 'invalid'), ('checkpoint_committed', 1), ('counts', {'records': -1})]:
            self.assertFalse(v.is_valid({**manifest, field: bad}), field)
        del manifest['config_sha256']
        self.assertFalse(v.is_valid(manifest))

    def test_log_severity_pairing_and_content_capture(self):
        event = {
            'schema_version': 'log-event.v1', 'timestamp': NOW, 'observed_timestamp': NOW,
            'event_name': 'pipeline.finished', 'severity_text': 'INFO', 'severity_number': 9,
            'body': 'Pipeline completed', 'trace_id': TRACE_ID, 'span_id': '1' * 16,
            'service_name': 'protokol-7', 'service_version': '1.1.0',
            'deployment_env': 'test', 'content_capture': False,
        }
        v = validator(SCHEMAS / 'log-event.v1.schema.json')
        for text, number in [('DEBUG', 5), ('INFO', 9), ('WARN', 13), ('ERROR', 17)]:
            v.validate({**event, 'severity_text': text, 'severity_number': number})
        for replacement in [{'severity_number': 17}, {'content_capture': True}, {'span_id': '0' * 16}, {'timestamp': 'today'}]:
            self.assertFalse(v.is_valid({**event, **replacement}))

    def test_ops_skills_resolve_schemas_policy_and_blocked_outputs(self):
        ops = ROOT / '.agents/skills/ops'
        for skill in sorted(ops.iterdir()):
            if not (skill / 'schemas').exists():
                continue
            with self.subTest(skill=skill.name):
                frontmatter = yaml.safe_load((skill / 'SKILL.md').read_text().split('---', 2)[1])
                self.assertEqual(frontmatter['name'], skill.name)
                self.assertEqual(frontmatter['category'], 'ops')
                for key in ['input-schema', 'output-schema']:
                    self.assertTrue((skill / frontmatter[key]).is_file())
                self.assertEqual((skill / 'references/platform-policy.md').resolve(), ROOT / 'context/code-standards.md')
                schema = json.loads((skill / frontmatter['output-schema']).read_text())
                v = Draft202012Validator(schema)
                v.validate({'status': 'blocked', 'artifacts': [], 'blockers': ['Required processor unavailable']})
                self.assertFalse(v.is_valid({'status': 'success', 'artifacts': [], 'blockers': []}))
                self.assertFalse(v.is_valid({'status': 'blocked', 'artifacts': [], 'blockers': []}))


if __name__ == '__main__':
    unittest.main()
