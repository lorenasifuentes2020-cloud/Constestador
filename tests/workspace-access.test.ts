import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTeamEmail,
  selectedWorkspaceOwner,
  TEAM_WORKSPACE_COOKIE,
} from '../lib/workspace-access.ts';

test('normaliza el correo usado para aceptar invitaciones', () => {
  assert.equal(normalizeTeamEmail('  Lorena.Sifuentes@Example.COM  '), 'lorena.sifuentes@example.com');
});

test('lee únicamente el espacio seleccionado desde su cookie', () => {
  const request = new Request('https://nexo.example/team', {
    headers: {
      cookie: `other=value; ${TEAM_WORKSPACE_COOKIE}=owner%2D123; session=private`,
    },
  });
  assert.equal(selectedWorkspaceOwner(request), 'owner-123');
});

test('rechaza selectores de espacio excesivamente largos', () => {
  const request = new Request('https://nexo.example/team', {
    headers: { cookie: `${TEAM_WORKSPACE_COOKIE}=${'x'.repeat(201)}` },
  });
  assert.equal(selectedWorkspaceOwner(request), null);
});
