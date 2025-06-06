document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('submissionForm');
  const searchInput = document.getElementById('searchInput');
  const departmentFilter = document.getElementById('departmentFilter');
  const leaderboardBody = document.getElementById('leaderboardBody');

  let debounceTimer;

  // Function to fetch and display leaderboard
  async function fetchLeaderboard() {
    const search = searchInput.value;
    const department = departmentFilter.value;

    try {
      const response = await fetch(`/leaderboard?search=${encodeURIComponent(search)}&department=${encodeURIComponent(department)}`);
      const data = await response.json();
      
      leaderboardBody.innerHTML = '';
      data.forEach((entry, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${index + 1}</td>
          <td><a href="https://leetcode.com/u/${entry.leetcode_username}/" target="_blank" class="leetcode-link">${entry.name}</a></td>
          <td>${entry.department.toUpperCase()}</td>
          <td>${entry.score}</td>
        `;
        leaderboardBody.appendChild(row);
      });
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    }
  }

  // Handle form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('name').value;
    const department = document.getElementById('department').value;
    const leetcodeUsername = document.getElementById('leetcodeUsername').value;

    try {
      const response = await fetch('/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, department, leetcodeUsername }),
      });

      if (response.ok) {
        form.reset();
        fetchLeaderboard();
      } else {
        const data = await response.json();
        if (data.error === 'LeetCode profile already exists') {
          alert('This LeetCode profile has already been registered. Please use a different profile.');
        } else if (data.error === 'Invalid LeetCode username') {
          alert('Invalid LeetCode username. Please check and try again.');
        } else {
          alert(data.error || 'Error submitting entry');
        }
      }
    } catch (error) {
      console.error('Error submitting entry:', error);
      alert('Error submitting entry. Please try again later.');
    }
  });

  // Handle search input with debounce
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fetchLeaderboard, 300);
  });

  // Handle department filter
  departmentFilter.addEventListener('change', fetchLeaderboard);

  // Initial fetch
  fetchLeaderboard();
});
  