import React from 'react';
import { CssBaseline, Container } from '@mui/material';
import FlightPriceTable from './components/FlightPriceTable';

function App() {
  return (
    <>
      <CssBaseline />
      <Container maxWidth="lg">
        <FlightPriceTable />
      </Container>
    </>
  );
}

export default App;