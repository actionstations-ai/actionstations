// Every simulated data generator a field ships through a side-effect import. A field adds its
// module here (one import line); fields that register from a function called at startup
// (src/main/index.ts, such as the clinical care toolkit) do not need a line.
import './ai/register-generators'
import './animal_disease/register-generators'
import './epidemiology/register-generators'
import './ems/generators'
import './justice/register-generators'
import './lab_safety/register-generators'
import './spill/generators'
import './weather/simulate'
import './weather/simulate-tropical'
