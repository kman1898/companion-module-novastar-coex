// Upgrade scripts. Never remove or reorder them: the array index is stored per
// connection. In API 2.x every stored option value is { isExpression, value }.

const value = (v) => ({ isExpression: false, value: v })

// v1.0.3 is still the default (stable) install for most users. v2.0.0 removed its
// blackout / normal / freeze actions without an upgrade script, so those buttons
// stopped working. Convert them to the Display Mode action that replaced them.
// (workingmode is still an action, restored with the same id and options.)
function v1DisplayActions(_context, props) {
	const modes = { blackout: 1, normal: 0, freeze: 2 }
	const updatedActions = []
	for (const action of props.actions) {
		if (action.actionId in modes) {
			action.options = { num: value(modes[action.actionId]) }
			action.actionId = 'display_mode'
			updatedActions.push(action)
		}
	}
	return { updatedConfig: null, updatedActions, updatedFeedbacks: [] }
}

export const UpgradeScripts = [v1DisplayActions]
