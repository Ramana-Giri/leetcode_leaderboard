document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('submissionForm');
  const searchInput = document.getElementById('searchInput');
  const departmentFilter = document.getElementById('departmentFilter');
  const leaderboardBody = document.getElementById('leaderboardBody');
  const refreshButton = document.getElementById('refreshScores');
  const weeklyImprovementsBody = document.getElementById('weeklyImprovementsBody');
  const toggleWeeklyImprovements = document.getElementById('toggleWeeklyImprovements');
  let currentPage = 1;
  let showingMoreWeekly = false;

  let debounceTimer;

  // Function to create pagination controls
  function createPaginationControls(totalPages, currentPage) {
    const paginationContainer = document.createElement('div');
    paginationContainer.className = 'd-flex justify-content-center mt-4';
    
    const pagination = document.createElement('ul');
    pagination.className = 'pagination';

    // Previous button
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
    prevLi.innerHTML = `<a class="page-link" href="#" data-page="${currentPage - 1}">Previous</a>`;
    pagination.appendChild(prevLi);

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
      const li = document.createElement('li');
      li.className = `page-item ${i === currentPage ? 'active' : ''}`;
      li.innerHTML = `<a class="page-link" href="#" data-page="${i}">${i}</a>`;
      pagination.appendChild(li);
    }

    // Next button
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
    nextLi.innerHTML = `<a class="page-link" href="#" data-page="${currentPage + 1}">Next</a>`;
    pagination.appendChild(nextLi);

    paginationContainer.appendChild(pagination);
    return paginationContainer;
  }

  // Function to fetch and display leaderboard
  async function fetchLeaderboard(page = 1) {
    const search = searchInput.value;
    const department = departmentFilter.value;

    try {
      const response = await fetch(`/leaderboard?search=${encodeURIComponent(search)}&department=${encodeURIComponent(department)}&page=${page}`);
      const result = await response.json();
      
      // Clear existing content
      leaderboardBody.innerHTML = '';
      
      // Display data
      result.data.forEach((entry, index) => {
        const row = document.createElement('tr');
        const rank = ((page - 1) * 30) + index + 1;
        row.innerHTML = `
          <td>${rank}</td>
          <td><a href="https://leetcode.com/u/${entry.leetcode_username}/" target="_blank" class="leetcode-link">${entry.name}</a></td>
          <td>${entry.department.toUpperCase()}</td>
          <td>${entry.score}</td>
        `;
        leaderboardBody.appendChild(row);
      });

      // Remove existing pagination if any
      const existingPagination = document.querySelector('.pagination-container');
      if (existingPagination) {
        existingPagination.remove();
      }

      // Add new pagination controls
      const paginationContainer = createPaginationControls(result.pagination.totalPages, page);
      paginationContainer.classList.add('pagination-container');
      leaderboardBody.parentElement.parentElement.appendChild(paginationContainer);

      // Add event listeners to pagination buttons
      document.querySelectorAll('.page-link').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const newPage = parseInt(e.target.dataset.page);
          if (newPage && newPage !== page) {
            currentPage = newPage;
            fetchLeaderboard(newPage);
          }
        });
      });

    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    }
  }

  // Function to fetch and display weekly improvements
  async function fetchWeeklyImprovements(limit = 5) {
    try {
      const response = await fetch(`/weekly-improvements?limit=${limit}`);
      const data = await response.json();
      
      weeklyImprovementsBody.innerHTML = '';
      if (data.length === 0) {
        weeklyImprovementsBody.innerHTML = `
          <tr>
            <td colspan="3" class="text-center">No improvements yet this week</td>
          </tr>
        `;
        return;
      }
      
      data.forEach((entry, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${index + 1}</td>
          <td><a href="https://leetcode.com/u/${entry.leetcode_username}/" target="_blank" class="leetcode-link">${entry.name}</a></td>
          <td class="text-success">+${entry.improvement}</td>
        `;
        weeklyImprovementsBody.appendChild(row);
      });
    } catch (error) {
      console.error('Error fetching weekly improvements:', error);
      weeklyImprovementsBody.innerHTML = `
        <tr>
          <td colspan="3" class="text-center text-danger">Error loading improvements</td>
        </tr>
      `;
    }
  }

  // Handle weekly improvements toggle
  toggleWeeklyImprovements.addEventListener('click', () => {
    showingMoreWeekly = !showingMoreWeekly;
    fetchWeeklyImprovements(showingMoreWeekly ? 10 : 5);
    toggleWeeklyImprovements.textContent = showingMoreWeekly ? 'Show Less' : 'Show More';
  });

  // Function to update scores
  async function updateScores() {
    try {
      refreshButton.disabled = true;
      refreshButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
      
      const response = await fetch('/update-scores', {
        method: 'POST'
      });
      
      if (response.ok) {
        await fetchLeaderboard();
        alert('Scores updated successfully!');
      } else {
        throw new Error('Failed to update scores');
      }
    } catch (error) {
      console.error('Error updating scores:', error);
      alert('Failed to update scores. Please try again later.');
    } finally {
      refreshButton.disabled = false;
      refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh Scores';
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
    currentPage = 1; // Reset to first page on new search
    debounceTimer = setTimeout(() => fetchLeaderboard(1), 300);
  });

  // Handle department filter
  departmentFilter.addEventListener('change', () => {
    currentPage = 1; // Reset to first page on filter change
    fetchLeaderboard(1);
  });

  // Handle refresh button
  refreshButton.addEventListener('click', updateScores);

  // Initial fetch for both leaderboard and weekly improvements
  fetchLeaderboard(1);
  fetchWeeklyImprovements(5);
});
  