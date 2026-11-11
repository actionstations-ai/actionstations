# Classroom and course use

Classroom mode lets an instructor run any exercise as a class session: map the exercise to course
outcomes, score each student with a rubric, and export grades. It works in every field and with
every toolkit.

## Turn it on

Open **Classroom** in the project sidebar. Classroom mode is off for every project until you read
the notice and turn it on:

> Scores name students. Ratings become grades only when the instructor confirms them. Student
> records stay in this project folder and are left out of shared exports.

Outside Classroom mode nothing changes: observations never name a player, and ratings are
discussion aids, not grades.

You can also tick **Use this project for a course** when you create a project; the same notice is
shown beside the box.

For advice on outcomes, rubrics, rotation, fair grading of a group exercise, accommodations and
records privacy, see the [instructor's guide](classroom-instructor-guide.md).

## Course, sections and roster

1. Save the course name, the term and one or more sections.
2. Add students one at a time, or paste or open a CSV. The file needs a `name` column and may have
   a student id and an email. Other columns are ignored. The app checks the file and tells you which
   rows it will skip (no name, a repeated student id) before it adds anything.
3. Students are listed by section. Delete one student to remove their roster entry, evidence,
   scores and accommodations together, or delete the whole term in one step.

A roster holds up to 500 students in up to 20 sections.

## Who sees what

Student names and scores are saved in the project folder, in a `classroom` folder, and nowhere
else. They are left out of exercise bundles, pack exports and copies made with **Duplicate
project**, and the folder is added to the project's git ignore list. If you share a project folder by
copying it yourself, leave the `classroom` folder out. The app never sends student records to a
service, and it never offers to.

When an evaluator records an observation about a student, the observation itself is saved the usual
way without a name, so the After Action Report and the live dashboard stay anonymous. The link
between the observation and the student is kept only in the classroom records.

Grades are education records held by your institution. Exporting them is your decision, and the
export screen says so.

## Learning outcomes

Add the outcomes of your course: a code, the outcome text, and optionally a Bloom level and the program
outcome it supports. Export a set as a file to reuse it next term, or import one. Pick a scenario and
choose **Suggest mappings** to see which objectives share words with an outcome. Suggestions are
only a starting point: nothing counts until you confirm it.

## Rubrics

A rubric belongs to a role, or to the whole team. Each criterion has a weight and three to six
levels, each with a descriptor and points, and can be linked to outcomes. **Add the starter
rubrics** gives you three original rubrics. **Player role** scores communication, decision
quality, role clarity, use of plans and situational awareness. **Team** scores coordination,
communication and decision quality. **Evaluator** scores observation quality, coverage of the
assigned tasks, and strengths and areas for improvement. Edit them freely. Rubrics
export and import as files. Rubrics from other institutions are not included when their license
forbids it; import them yourself if yours allows.

## Evidence and scoring

Pick a scenario under **Scoring**. For each student you see every criterion of the rubrics the
session uses, the evidence recorded for that student and criterion, and a suggested level. The
suggestion follows one fixed rule: the highest level at least two pieces of evidence support (or the
only piece, if there is just one), and the basis is printed beside it. Nothing is graded until you
choose a level. Team rubrics give every team member the team score unless you set a student apart.
A weighted total and a score per outcome are worked out from your choices.

Use **+ Hot wash contribution** to count a contribution with one tap. Contributions are counted by
you; they are never attributed from the recording.

## Role rotation

Give the roles and the number of sessions and choose **Plan the rotation**. Each session covers
every role, and a student does not repeat a role until they have played them all. If the roster is
too small to cover the roles, the plan says so.

## Exporting grades

Under **Gradebook export**, choose a section and choose **Preview**. The preview lists what the file
will hold and warns about students without a score, students without a student id, and practice
runs, which are always left out. You can add a column per outcome (percent), per rubric criterion
(points) and a short comment. Points are weighted rubric points. **Save the CSV file** keeps it on
your computer; nothing is sent anywhere. Cells that a spreadsheet could read as a formula are made
safe. Upload the file through your gradebook's import screen and map the columns there. Automatic
grade passback from the learning management system is not available.

Grades are education records held by your institution, so exporting them is your decision.

## Dashboard

The dashboard shows, for each section: how many students reached your attainment threshold for
each outcome, the spread of scores, which students have no score yet, which roles in the rotation a
student has not played, and how many graded and practice runs there were. Practice runs never count
toward attainment or distributions. Every figure is also a table you can download as a CSV.

When two or more evaluators rated the same student on the same criterion, the dashboard shows how
often they agreed exactly and within one level, a weighted kappa for two evaluators or an intraclass
correlation for three or more, and the criteria with the lowest agreement. Participation shows each
student's share of decisions and hot wash contributions against an even share. It is an aid for you,
not a grade. With few ratings these numbers are unstable, and the screen says so.

## Accommodations

Record adjustments for a student: a time multiplier for that student's timed responses and prompts
(the shared clock does not change), written or spoken responses, a screen-reader or large-print
packet, breaks, and an observer or evaluator role with an equivalent rubric. They record
adjustments, not diagnoses. They are private to you: they are left out of shared files, the After
Action Report and the dashboard, which shows only a count.

## Running a session

Under **Session set-up**, choose the scenario and the section, tick **Practice run** if the session
should not count, choose the rubrics that apply and seat students by role. The adjustments to
remember for the seated students are listed there.

- **Evaluators** who join a live session see the seated students in a **Observing** list. Choose a
  student and every rating you save is about that student; choose **Whole team** to go back. The
  After Action Report and the live record never carry a student's name.
- **Reflections.** **Save the reflection survey** builds a survey from your reflection prompts.
  Open it from the Surveys panel during the live session. Students are told that, unlike other
  surveys, their answers go to you with their name. A student is matched by the role you seated
  them in, or by a display name that matches the roster exactly; an answer from a device that
  matches no one is not kept against anyone. For paper, **Reflection sheets PDF** prints one page
  per student, and **Type in a reflection from a printed sheet** adds the answer afterward.
- **Extra time.** A student with a time multiplier gets a later close on surveys and a longer drill
  time on their own device. Votes and decision forms are group actions and are not extended.
- **Make-up version.** **Create a make-up version** starts a new scenario with the same objectives,
  mapped outcomes and rubrics and different facts. It runs through the usual generation steps, so
  it needs a model provider like any scenario.

## Printing

**Handout PDF** on a rubric prints the rubric for students. **Score report PDF** on a student prints
their scores with the evidence quoted and your comments; for a practice run it says the run does
not count. PDFs are saved where you choose and are not kept in the project.
