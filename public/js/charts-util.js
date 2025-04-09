/**
 * Utility functions for chart generation
 */

function getRandomColor() {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

function generateChartColors(count) {
  const baseColors = [
    '#4e73df', // primary
    '#1cc88a', // success
    '#36b9cc', // info
    '#f6c23e', // warning
    '#e74a3b', // danger
    '#5a5c69', // dark
    '#858796', // secondary
    '#6f42c1', // purple
    '#20c9a6', // teal
    '#fd7e14', // orange
  ];
  
  // If we have enough base colors, use them
  if (count <= baseColors.length) {
    return baseColors.slice(0, count);
  }
  
  // Otherwise, generate random colors
  const colors = [...baseColors];
  for (let i = baseColors.length; i < count; i++) {
    colors.push(getRandomColor());
  }
  
  return colors;
}

function createBarChart(ctx, data, labels, title) {
  const colors = generateChartColors(data.length);
  
  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: title,
        data: data,
        backgroundColor: colors,
        borderColor: colors,
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        title: {
          display: false
        }
      }
    }
  });
}

function createLineChart(ctx, data, labels, title) {
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: title,
        data: data,
        backgroundColor: 'rgba(78, 115, 223, 0.2)',
        borderColor: 'rgba(78, 115, 223, 1)',
        borderWidth: 2,
        pointBackgroundColor: 'rgba(78, 115, 223, 1)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: 'rgba(78, 115, 223, 1)',
        tension: 0.1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        title: {
          display: false
        }
      }
    }
  });
}

function createPieChart(ctx, data, labels, title) {
  const colors = generateChartColors(data.length);
  
  return new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderColor: '#fff',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            boxWidth: 15,
            padding: 15
          }
        },
        title: {
          display: false
        }
      }
    }
  });
}

function createDoughnutChart(ctx, data, labels, title, customOptions = null) {
  const colors = generateChartColors(data.length);
  
  // Default options
  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          boxWidth: 15,
          padding: 15
        }
      },
      title: {
        display: false
      }
    }
  };
  
  // Merge custom options with defaults if provided
  const options = customOptions ? { ...defaultOptions, ...customOptions } : defaultOptions;
  
  return new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderColor: '#fff',
        borderWidth: 2
      }]
    },
    options: options
  });
}
