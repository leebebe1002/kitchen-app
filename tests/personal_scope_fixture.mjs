// Isolated authorization for tests that exercise engine logic without an Auth server.
export function authorizeTestEngine(engine, scopeId = 'household') {
    const context = Object.freeze({ scopeId, userId: 'fixture-user' });
    engine.auth = {
        getPersonalContext: () => context,
        isCurrentContext: value => value === context
    };
    engine.personalContext = context;
    engine.personalScope = scopeId;
    engine.personalRevision = null;
}

export function switchTestScope(engine, scopeId) {
    const context = Object.freeze({ scopeId, userId: 'fixture-user' });
    engine.auth = {
        getPersonalContext: () => context,
        isCurrentContext: value => value === context
    };
    engine.setPersonalScope(scopeId);
}
