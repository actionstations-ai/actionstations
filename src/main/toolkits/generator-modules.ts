// Every simulated data generator a field ships. A field adds its module here (one import line) so
// its generators are registered wherever case data is generated.
import './clinical/generators'
import './epidemiology/register-generators'
import './ems/generators'
