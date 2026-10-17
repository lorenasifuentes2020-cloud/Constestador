import test from 'node:test';
import assert from 'node:assert/strict';
import { describeWorkspaceAction } from '../lib/workspace-audit.ts';

test('describe cambios sin copiar datos personales al historial', () => {
  assert.equal(describeWorkspaceAction('order.create', {
    customer: 'Cliente privado',
    notes: 'Dirección privada',
  }), 'Registró un pedido');
  assert.equal(describeWorkspaceAction('contact.save', {
    id: 'contact-1',
    name: 'Cliente privado',
  }), 'Actualizó un cliente');
});

test('incluye estados permitidos y usa un texto seguro para valores extraños', () => {
  assert.equal(
    describeWorkspaceAction('order.status', { status: 'Entregado' }),
    'Cambió el estado de un pedido a entregado',
  );
  assert.equal(
    describeWorkspaceAction('order.payment.add', { amount: 50, reference: '<script>' }),
    'Registró un abono verificado',
  );
  assert.equal(
    describeWorkspaceAction('order.refund.add', { amount: 20, reference: '<script>' }),
    'Registró un reembolso',
  );
});

test('distingue altas y actualizaciones por el identificador del registro', () => {
  assert.equal(describeWorkspaceAction('product.save', { name: 'Nuevo' }), 'Añadió un producto');
  assert.equal(describeWorkspaceAction('product.save', { id: 'product-1' }), 'Actualizó un producto');
  assert.equal(describeWorkspaceAction('unknown', {}), 'Actualizó el espacio de trabajo');
  assert.equal(describeWorkspaceAction('workspace.import', { backup: { stores: [] } }), 'Restauró un respaldo del espacio');
});
