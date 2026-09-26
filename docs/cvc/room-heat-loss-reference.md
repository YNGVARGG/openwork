# Reference case: one-room winter heat loss

## Purpose and applicability

This is a small, synthetic regression fixture for the first CVC Studio
milestone.  It defines a steady-state, sensible-heat calculation for one room
with declared boundary temperatures.  It is independently calculated below so
that an implementation can be checked without using the implementation itself
as the oracle.

It is a preliminary heat-loss study only.  It is **not** an implementation or
validation of EN 12831 (or any other regulatory method), and must not be
presented as a compliance calculation, equipment selection, or design sizing.
Every number in the fixture is deliberately supplied as test data; none is a
climatic, construction, air-property, or standards default.

The calculation applies only when each envelope boundary has a directly
declared adjacent-air temperature no greater than the room indoor temperature.
For this fixture, an unheated room and a room below are represented by their
provided temperatures.  The program does not infer a temperature-reduction
factor, ground model, or any temperature from geometry.

## Method and units

For each opaque surface and each opening, sensible transmission loss is:

```text
Qdot = U * A * (Ti - Tb)
```

where `Qdot` is W, `U` is W/(m2 K), `A` is m2, and `Ti - Tb` is K.  A
temperature difference in degrees Celsius has the same numerical magnitude in
kelvin.  The U-A-temperature-difference relationship is used by the US
Department of Energy's Building America training material for transmission
losses ([*Estimating a Building Envelope's Energy Performance*, equation 1]
(https://www1.eere.energy.gov/buildings/publications/pdfs/building_america/ns/eemtg082011_c12_envelope_energy.pdf)).

For explicitly supplied external-air exchange, sensible loss is:

```text
mdot = rho * Vdot / 3600
Qdot_air = mdot * cp * (Ti - Tsupply)
```

where `Vdot` is m3/h, `rho` is kg/m3, `mdot` is kg/s, `cp` is J/(kg K), and
the result is W (= J/s).  This is the mass-flow form of the constant-pressure
heat relation `qdot = mdot * cp * deltaT` given in [NASA technical material,
equation 2](https://ntrs.nasa.gov/api/citations/20205003955/downloads/Updated20205003955_IA%20State_2020.pdf?attachment=true).
The input values for density and specific heat are supplied rather than
selected by the program.  This also avoids implying that they are invariant
with temperature or pressure.

For an explicit linear thermal bridge:

```text
Qdot_bridge = psi * L * (Ti - Tb)
```

where `psi` is W/(m K) and `L` is m.  This term is included separately from
surface U-values; whether a given U-value already includes a bridge is an
input/provenance question, not an assumption the calculation makes.

The room result is the sum of all valid surface/opening, air-exchange, and
explicit bridge contributions.  Keep full precision in a saved calculation;
the decimal display below is only for readability.

### Gross and net areas

An opaque parent surface records a gross area.  Its net opaque area is its
gross area less the areas of its directly nested openings:

```text
A_net(parent) = A_gross(parent) - sum(A_opening)
```

The parent contribution uses `A_net`; every opening is calculated once with
its own U-value.  An opening may not be linked to more than one parent, the
opening-area sum must not exceed the gross area, and an opening may not also
be entered as an independent opaque surface.  These conditions prevent double
counting and negative net areas.

## Synthetic baseline fixture (all values supplied)

Room geometry, recorded for inspection but not used to derive any area: 4 m by
3 m by 2.5 m.  Indoor temperature `Ti = 20 degC`.  The supplied condition
records are `exteriorAir = -5 degC`, `unheatedRoom = 10 degC`,
`conditionedAdjacent = 20 degC`, and `roomBelow = 10 degC`.  The external
air-exchange input references `exteriorAir` as its supply temperature.

| Contribution | Area basis | U or psi | Boundary temperature | Calculation | Loss (W) |
| --- | ---: | ---: | ---: | --- | ---: |
| North opaque wall | gross 10 m2 - window 2 m2 = net 8 m2 | U = 0.30 W/(m2 K) | exteriorAir: -5 degC | 0.30 * 8 * 25 | 60 |
| North window (nested in north wall) | 2 m2 | U = 1.40 W/(m2 K) | exteriorAir: -5 degC | 1.40 * 2 * 25 | 70 |
| East wall to unheated room | 7.5 m2 | U = 0.50 W/(m2 K) | unheatedRoom: 10 degC | 0.50 * 7.5 * 10 | 37.5 |
| South wall to conditioned adjacent room | 10 m2 | U = 0.40 W/(m2 K) | conditionedAdjacent: 20 degC | 0.40 * 10 * 0 | 0 |
| West wall to conditioned adjacent room | 7.5 m2 | U = 0.40 W/(m2 K) | conditionedAdjacent: 20 degC | 0.40 * 7.5 * 0 | 0 |
| Ceiling | 12 m2 | U = 0.20 W/(m2 K) | exteriorAir: -5 degC | 0.20 * 12 * 25 | 60 |
| Floor to room below | 12 m2 | U = 0.25 W/(m2 K) | roomBelow: 10 degC | 0.25 * 12 * 10 | 30 |
| Linear thermal bridge to exterior | L = 5 m | psi = 0.10 W/(m K) | exteriorAir: -5 degC | 0.10 * 5 * 25 | 12.5 |

The supplied external-air exchange is `Vdot = 60 m3/h`, `rho = 1.20 kg/m3`,
`cp = 1000 J/(kg K)`, and supply condition `exteriorAir = -5 degC`.  Its
independent arithmetic is:

```text
mdot = 1.20 * 60 / 3600 = 0.020 kg/s
Qdot_air = 0.020 * 1000 * (20 - -5) = 500 W
```

Therefore:

```text
surface/opening subtotal = 60 + 70 + 37.5 + 0 + 0 + 60 + 30 = 257.5 W
bridge subtotal          = 12.5 W
air-exchange subtotal    = 500 W
total                    = 770 W
```

## Changed-input regression case

Starting from the baseline fixture, change the one supplied condition record
`exteriorAir` from `-5 degC` to `-10 degC`.  The north wall/window, ceiling,
bridge, and air exchange all reference that condition, so their temperature
difference changes together.  All other inputs, including the unheated-room
and room-below temperatures, remain unchanged.

| Contribution | Expected loss (W) |
| --- | ---: |
| North opaque wall | 72 |
| North window | 84 |
| East wall | 37.5 |
| South wall | 0 |
| West wall | 0 |
| Ceiling | 72 |
| Floor | 30 |
| Thermal bridge | 15 |
| Air exchange | 600 |
| **Total** | **910.5** |

```text
surface/opening subtotal = 72 + 84 + 37.5 + 0 + 0 + 72 + 30 = 295.5 W
bridge subtotal          = 15 W
air-exchange subtotal    = 600 W
total                    = 910.5 W
```

The expected change is `+140.5 W`.  A deterministic calculator should preserve
the original input revision/run and produce this second result from the
changed revision.

For automated checks, compare every listed contribution, subtotal, total, and
change with an absolute tolerance of `1e-9 W`.  That allowance only absorbs
ordinary binary floating-point evaluation of the supplied decimal inputs; it
is far below the `0.1 W` precision shown here and is not an engineering
tolerance or a method uncertainty allowance.

## Required exclusions and validation boundaries

- Solar and internal gains, intermittent operation, moisture/latent loads,
  thermal mass, dynamic effects, ducts, equipment capacity, and distribution
  losses are excluded.
- Air exchange is only an explicitly supplied volumetric flow with supplied
  density, specific heat, and supply temperature.  The fixture includes no
  automatic infiltration, air-change-rate conversion, heat recovery, wind, or
  stack-effect model.
- Thermal bridges are included only when each `psi`, length, and boundary
  temperature is explicit.  Otherwise they must be reported as excluded with
  a reason; they must never be silently added as a percentage or default
  allowance.
- Inputs with missing required units/values, negative area/length/flow,
  opening sums exceeding the parent gross area, duplicate openings, or a
  boundary warmer than the room are invalid for this narrow method and block a
  numerical result.
