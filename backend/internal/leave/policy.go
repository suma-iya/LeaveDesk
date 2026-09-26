package leave

// Policy is the company-wide default allowance per type (from config).
type Policy struct {
	Defaults map[Type]int
}

func NewPolicy(defaults map[string]int) Policy {
	p := Policy{Defaults: map[Type]int{}}
	for _, t := range Types {
		p.Defaults[t] = defaults[string(t)]
	}
	return p
}

// Balances combines the policy, per-employee overrides and usage:
// available = limit − used − pending.
func (p Policy) Balances(overrides map[Type]int, usage Usage) []Balance {
	out := make([]Balance, 0, len(Types))
	for _, t := range Types {
		limit, custom := overrides[t]
		if !custom {
			limit = p.Defaults[t]
		}
		u := usage[t]
		out = append(out, Balance{Type: t, Limit: limit, Used: u.Used, Pending: u.Pending,
			Available: limit - u.Used - u.Pending, IsDefault: !custom})
	}
	return out
}

func find(balances []Balance, t Type) Balance {
	for _, b := range balances {
		if b.Type == t {
			return b
		}
	}
	return Balance{Type: t}
}
