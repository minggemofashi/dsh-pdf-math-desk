'use strict'

/**
 * Minimal react/jsx-runtime shim for the host-primitives bundle.
 *
 * The primitives package is compiled against React's automatic runtime, but
 * the DSH client module table exposes only `react`. This shim keeps the bundle
 * on that single React instance instead of shipping a second copy.
 */
const React = require('react')

function normalize(props, key) {
  const next = props === null || props === undefined ? {} : { ...props }
  if (key !== undefined && key !== null) next.key = key
  return next
}

exports.Fragment = React.Fragment
exports.jsx = (type, props, key) => React.createElement(type, normalize(props, key))
exports.jsxs = (type, props, key) => React.createElement(type, normalize(props, key))
exports.jsxDEV = (type, props, key) => React.createElement(type, normalize(props, key))
